import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/workspace-session"
import { applyMigrations } from "./migrations"
const context = vi.hoisted(() => ({ database: null as unknown, actor: null as Session | null }))
vi.mock("@/db", () => ({ db: () => context.database }))
vi.mock("../src/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => context.actor
}))
import { amazonReconciliation } from "../src/server/amazon-reconciliation-data"
import { GET } from "../src/server/http/api/analytics/amazon/reconciliation"
const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const orgId = randomUUID(),
  otherId = randomUUID()
function actor(id: string, kind: "buyer" | "supplier"): Session {
  return {
    user: { id: `user-${id}`, email: "owner@example.com", emailVerified: true, name: "Olive Owner" },
    org: {
      id,
      kind,
      name: kind,
      workosId: null,
      timeZone: null,
      excludedShopifyTags: ["Amazon"],
      restockSalesDays: null,
      restockLeadTimeDays: null,
      createdAt: new Date()
    },
    role: "owner",
    access: {},
    workspaces: []
  }
}

const request = (query = "source=returns&from=2026-10-01&to=2026-11-01") =>
  new Request(`https://example.test/api/analytics/amazon/reconciliation?${query}`)
const input = { source: "returns" as const, from: "2026-10-01", to: "2026-11-01", page: 0 }
const baseRow = {
  externalAccountId: "SELLER1",
  marketplaceId: "ATVPDKIKX0DER",
  returnedAt: new Date("2026-10-02"),
  orderId: "ORDER1",
  sku: "SKU1",
  asin: "A1",
  fnsku: "FN1",
  quantity: 1
}
beforeAll(async () => {
  context.database = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE")
  await database.insert(tables.organizations).values([
    { id: orgId, kind: "buyer", name: "Buyer" },
    { id: otherId, kind: "buyer", name: "Other" }
  ])
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId: "SELLER1", encryptedToken: "test" })
  context.actor = actor(orgId, "buyer")
})
describe("Amazon reconciliation endpoint", () => {
  it("uses UTC window boundaries when ranking near the search limit in a non-UTC session", async () => {
    await database.insert(tables.amazonReturns).values({ ...baseRow, orgId, orderId: "UNMATCHED" })
    await pg.query(
      `insert into amazon_transactions ("orgId","externalAccountId","transactionId","orderId","postedAt",type,currency,"totalMinor","feesMinor",data)
      select $1,'SELLER1','REFUND-'||i,null,'2026-10-15T00:00:00Z','Refund','USD',-10,0,'{"items":[{"contexts":[{"contextType":"ProductContext","sku":"SKU1","asin":"A1"}]}]}'::jsonb from generate_series(1,4999) i`,
      [orgId]
    )
    await database.insert(tables.amazonTransactions).values(
      [
        { id: "EARLY", date: "2026-10-01T00:01:00Z" },
        { id: "LATE", date: "2026-11-01T00:01:00Z" }
      ].map((item) => ({
        orgId,
        externalAccountId: "SELLER1",
        transactionId: item.id,
        orderId: null,
        postedAt: new Date(item.date),
        type: "Refund",
        currency: "USD",
        totalMinor: -10,
        feesMinor: 0,
        data: { items: [{ contexts: [{ contextType: "ProductContext", sku: "SKU1", asin: "A1" }] }] }
      }))
    )
    await pg.exec("SET TIME ZONE 'Pacific/Honolulu'")
    try {
      const result = await amazonReconciliation(orgId, input)
      expect(result.rows[0]?.finance.candidates[0]?.transactionId).toBe("EARLY")
      expect(result.coverage?.financialSearch.truncated).toBe(true)
      expect(result.coverage?.financialSearch.nextPostingPage).toBe(1)
      const tail = await amazonReconciliation(orgId, { ...input, postingPage: 1, snapshot: result.snapshot })
      expect(tail.rows[0]?.finance.candidates.map((r) => r.transactionId)).toEqual(["LATE"])
      expect(tail.coverage?.financialSearch.nextPostingPage).toBeNull()
      await expect(amazonReconciliation(orgId, { ...input, postingPage: 1 })).rejects.toMatchObject({
        code: "snapshot_required"
      })
      const candidatePage = await amazonReconciliation(orgId, { ...input, candidatePage: 1, snapshot: result.snapshot })
      expect(candidatePage.rows[0]?.finance.candidates).toHaveLength(20)
      expect(
        candidatePage.rows[0]?.finance.candidates.some((r) =>
          result.rows[0]?.finance.candidates.some((first) => first.transactionId === r.transactionId)
        )
      ).toBe(false)
    } finally {
      await pg.exec("SET TIME ZONE 'UTC'")
    }
  })
  it("retains relevant refund postings before the product-only search bound", async () => {
    await database.insert(tables.amazonReturns).values({ ...baseRow, orgId, orderId: "UNMATCHED" })
    await pg.query(
      `insert into amazon_transactions ("orgId","externalAccountId","transactionId","orderId","postedAt",type,currency,"totalMinor","feesMinor",data)
      select $1,'SELLER1','SALE-'||i,null,'2026-10-16','Shipment','USD',10,0,'{"items":[{"contexts":[{"contextType":"ProductContext","sku":"SKU1","asin":"A1"}]}]}'::jsonb from generate_series(1,5001) i`,
      [orgId]
    )
    await database.insert(tables.amazonTransactions).values({
      orgId,
      externalAccountId: "SELLER1",
      transactionId: "OLD-REFUND",
      orderId: null,
      postedAt: new Date("2026-01-01"),
      type: "Refund",
      currency: "USD",
      totalMinor: -10,
      feesMinor: 0,
      data: { items: [{ contexts: [{ contextType: "ProductContext", sku: "SKU1", asin: "A1" }] }] }
    })
    const result = await amazonReconciliation(orgId, input)
    expect(result.rows[0]?.finance.candidates[0]?.transactionId).toBe("OLD-REFUND")
    expect(result.rows[0]?.finance.reconciled).toBe(false)
    expect(result.coverage?.financialSearch.truncated).toBe(true)
  })
  it("scopes evidence, current inventory and postings to the connected seller and workspace", async () => {
    await database.insert(tables.amazonReturns).values([
      { ...baseRow, orgId },
      { ...baseRow, orgId: otherId },
      { ...baseRow, orgId, externalAccountId: "OLD" },
      { ...baseRow, orgId, marketplaceId: "OTHER" }
    ])
    await database.insert(tables.amazonTransactions).values([
      {
        orgId,
        externalAccountId: "SELLER1",
        transactionId: "T1",
        orderId: "ORDER1",
        postedAt: new Date("2026-10-03"),
        type: "Refund",
        currency: "USD",
        totalMinor: 10,
        feesMinor: 0,
        data: {}
      },
      {
        orgId: otherId,
        externalAccountId: "SELLER1",
        transactionId: "SECRET",
        orderId: "ORDER1",
        postedAt: new Date("2026-10-03"),
        type: "Refund",
        currency: "USD",
        totalMinor: 10,
        feesMinor: 0,
        data: {}
      }
    ])
    const result = await amazonReconciliation(orgId, input)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.finance.candidates.map((row) => row.transactionId)).toEqual(["T1"])
    expect(result.rows[0]?.product.status).toBe("unmatched")
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(JSON.stringify(await response.json())).not.toContain("SECRET")
  })
  it("reads every acquired dataset and preserves its source kind and dates", async () => {
    const scoped = { orgId, externalAccountId: "SELLER1", marketplaceId: "ATVPDKIKX0DER" }
    await database
      .insert(tables.amazonReimbursements)
      .values({ ...scoped, approvedAt: new Date("2026-10-02"), reimbursementId: "REIM1", amountTotal: "0.123456789" })
    await database.insert(tables.amazonInventoryMovements).values({
      ...scoped,
      eventDay: "2026-10-02",
      eventType: "Adjustment",
      quantity: -1,
      referenceId: "NOT_A_SALES_ORDER"
    })
    await database.insert(tables.amazonStorageFees).values({
      ...scoped,
      kind: "monthly",
      basis: "estimate",
      periodDay: "2026-10-01",
      amount: "2.123456789",
      data: {}
    })
    await database.insert(tables.amazonRemovals).values({
      ...scoped,
      kind: "shipments",
      requestedAt: new Date("2026-09-01"),
      shippedAt: new Date("2026-10-03"),
      orderId: "REM1"
    })
    for (const source of ["reimbursements", "movements", "storage", "removals"] as const) {
      const result = await amazonReconciliation(orgId, { ...input, source })
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]?.occurredAt.startsWith("2026-10")).toBe(true)
      expect(result.rows[0]?.finance.reconciled).toBe(false)
    }
    expect((await amazonReconciliation(orgId, { ...input, source: "movements" })).rows[0]?.orderId).toBeNull()
    expect((await amazonReconciliation(orgId, { ...input, source: "storage" })).rows[0]?.amount).toBe("2.123456789")
  })
  it("uses scoped FBA observations and rereads corrections instead of retaining stale matches", async () => {
    await database.insert(tables.amazonReturns).values({ ...baseRow, orgId })
    const snapshot = {
      source: "fba",
      scopeKey: "ATVPDKIKX0DER",
      observedAt: "2026-10-15T00:00:00Z",
      rows: [{ sellerSku: "SKU1", asin: "A1", fnSku: "FN1" }]
    }
    await pg.query(
      'INSERT INTO stock_snapshots ("orgId",source,"externalAccountId","scopeKey",status,data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
      [orgId, "fba", "SELLER1", "ATVPDKIKX0DER", "idle", JSON.stringify(snapshot)]
    )
    expect((await amazonReconciliation(orgId, input)).rows[0]?.product.status).toBe("matched_current")
    await database.delete(tables.stockSnapshots)
    expect((await amazonReconciliation(orgId, input)).rows[0]?.product.status).toBe("unmatched")
    await database.insert(tables.amazonReturnReports).values({
      orgId,
      externalAccountId: "SELLER1",
      marketplaceId: "ATVPDKIKX0DER",
      from: new Date("2026-10-01"),
      requestedTo: new Date("2026-10-16"),
      coveredTo: new Date("2026-10-15"),
      status: "failed",
      errorCode: "report_failed",
      rowCount: 1
    })
    expect((await amazonReconciliation(orgId, input)).coverage?.reports).toMatchObject([
      { status: "failed", errorCode: "report_failed" }
    ])
  })
  it("explicitly flags the bounded financial search instead of treating unseen postings as absent", async () => {
    await database.insert(tables.amazonReturns).values({ ...baseRow, orgId })
    for (let batch = 0; batch < 6; batch++) {
      await database.insert(tables.amazonTransactions).values(
        Array.from({ length: batch === 5 ? 1 : 1000 }, (_, index) => ({
          orgId,
          externalAccountId: "SELLER1",
          transactionId: `T${batch}-${index}`,
          orderId: "ORDER1",
          postedAt: new Date("2026-10-03"),
          type: "Refund",
          currency: "USD",
          totalMinor: 10,
          feesMinor: 0,
          data: {}
        }))
      )
    }
    const result = await amazonReconciliation(orgId, input)
    expect(result.coverage?.financialSearch).toMatchObject({ limit: 5000, truncated: true })
  })
  it("finds historical references despite more than 5000 newer unrelated postings", async () => {
    await database.insert(tables.amazonReturns).values({ ...baseRow, orgId })
    await pg.query(
      `insert into amazon_transactions ("orgId","externalAccountId","transactionId","orderId","postedAt",type,currency,"totalMinor","feesMinor",data)
      select $1,'SELLER1','UNRELATED-'||i,'OTHER','2026-10-16','Refund','USD',10,0,'{}'::jsonb from generate_series(1,5001) i`,
      [orgId]
    )
    await database.insert(tables.amazonTransactions).values({
      orgId,
      externalAccountId: "SELLER1",
      transactionId: "HISTORICAL",
      orderId: null,
      postedAt: new Date("2026-01-01"),
      type: "Refund",
      currency: "USD",
      totalMinor: 10,
      feesMinor: 0,
      data: { relatedIdentifiers: [{ relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "ORDER1" }] }
    })
    const result = await amazonReconciliation(orgId, input)
    expect(result.rows[0]?.finance.candidates.map((candidate) => candidate.transactionId)).toEqual(["HISTORICAL"])
    expect(result.coverage?.financialSearch.truncated).toBe(false)
  })
  it("searches product contexts with null references and ignores other context types", async () => {
    await database.insert(tables.amazonReturns).values({ ...baseRow, orgId, orderId: "UNMATCHED" })
    await database.insert(tables.amazonTransactions).values(
      ["ProductContext", "OtherContext"].map((contextType) => ({
        orgId,
        externalAccountId: "SELLER1",
        transactionId: contextType,
        orderId: null,
        postedAt: new Date("2026-01-01"),
        type: "Refund",
        currency: "USD",
        totalMinor: 10,
        feesMinor: 0,
        data: { relatedIdentifiers: null, items: [{ contexts: [{ contextType, sku: "SKU1", asin: "A1" }] }] }
      }))
    )
    const result = await amazonReconciliation(orgId, input)
    expect(result.rows[0]?.finance.candidates.map((candidate) => candidate.transactionId)).toEqual(["ProductContext"])
  })
  it("does not match unrelated postings when a page has no order or product identifiers", async () => {
    await database.insert(tables.amazonStorageFees).values({
      orgId,
      externalAccountId: "SELLER1",
      marketplaceId: "ATVPDKIKX0DER",
      kind: "monthly",
      basis: "estimate",
      periodDay: "2026-10-01",
      currency: "USD",
      amount: "1",
      data: {}
    })
    await database.insert(tables.amazonTransactions).values({
      orgId,
      externalAccountId: "SELLER1",
      transactionId: "UNRELATED",
      orderId: "ORDER1",
      postedAt: new Date("2026-10-02"),
      type: "ServiceFee",
      currency: "USD",
      totalMinor: -100,
      feesMinor: 100,
      data: { items: [{ contexts: [{ contextType: "ProductContext", sku: "SKU1", asin: "A1" }] }] }
    })
    const result = await amazonReconciliation(orgId, { ...input, source: "storage" })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.finance).toMatchObject({ status: "unmatched", candidates: [], candidateCount: 0 })
    expect(result.coverage?.financialSearch.truncated).toBe(false)
  })
  it("paginates without claiming empty evidence means complete coverage", async () => {
    await database.insert(tables.amazonReturns).values(Array.from({ length: 101 }, () => ({ ...baseRow, orgId })))
    const first = await amazonReconciliation(orgId, input)
    const second = await amazonReconciliation(orgId, { ...input, page: 1, snapshot: first.snapshot })
    expect(first.rows).toHaveLength(100)
    expect(first.hasMore).toBe(true)
    expect(second.rows).toHaveLength(1)
    expect(second.hasMore).toBe(false)
    expect(first.rows.some((row) => row.id === second.rows[0]?.id)).toBe(false)
    expect(first.coverage?.reports).toEqual([])
    expect(first.coverage?.finances).toBeNull()
  })
  it("requires buyer, sales and price permissions before exposing evidence", async () => {
    context.actor = actor(orgId, "supplier")
    expect((await GET(request())).status).toBe(403)
    context.actor = { ...actor(orgId, "buyer"), role: "member", access: { sales: "view" } }
    expect((await GET(request())).status).toBe(403)
    context.actor = { ...actor(orgId, "buyer"), role: "member", access: { prices: "view" } }
    expect((await GET(request())).status).toBe(403)
  })
  it("rejects invalid windows and returns no stale-account records when disconnected", async () => {
    for (const query of [
      "source=bad&from=2026-10-01&to=2026-11-01",
      "source=returns&from=2026-01-01&to=2026-11-01",
      "source=returns&from=2026-11-01&to=2026-10-01",
      "source=returns&from=2026-10-01&to=2026-11-01&page=-1"
    ]) {
      expect((await GET(request(query))).status).toBe(400)
    }
    await database.delete(tables.connections)
    expect(await amazonReconciliation(orgId, input)).toMatchObject({ connected: false, rows: [], hasMore: false })
  })
})

it("retains inventory replacements and follows explicit reimbursement reversals outside the period", async () => {
  await database.insert(tables.amazonReimbursements).values([
    {
      orgId,
      externalAccountId: "SELLER1",
      marketplaceId: "ATVPDKIKX0DER",
      approvedAt: new Date("2026-10-02"),
      reimbursementId: "R1",
      quantityCash: 1,
      quantityInventory: 2,
      quantityTotal: 3,
      amountTotal: "4",
      currency: "USD"
    },
    {
      orgId,
      externalAccountId: "SELLER1",
      marketplaceId: "ATVPDKIKX0DER",
      approvedAt: new Date("2026-11-02"),
      reimbursementId: "REV",
      originalReimbursementId: "R1",
      originalReimbursementType: "CASH",
      quantityCash: -1,
      amountTotal: "-4",
      currency: "USD"
    },
    {
      orgId: otherId,
      externalAccountId: "SELLER1",
      marketplaceId: "ATVPDKIKX0DER",
      approvedAt: new Date("2026-11-02"),
      reimbursementId: "FOREIGN",
      originalReimbursementId: "R1"
    }
  ])
  const result = await amazonReconciliation(orgId, { ...input, source: "reimbursements" })
  expect(result.rows[0]?.reimbursement).toMatchObject({
    id: "R1",
    quantityCash: 1,
    quantityInventory: 2,
    quantityTotal: 3
  })
  expect(result.relatedReimbursements).toEqual([
    expect.objectContaining({ id: "R1" }),
    expect.objectContaining({ id: "REV", originalId: "R1", amount: "-4" })
  ])
})

it("calculates a complete stored reimbursement family across periods and excludes other sellers", async () => {
  const original = {
    orgId,
    externalAccountId: "SELLER1",
    marketplaceId: "ATVPDKIKX0DER",
    approvedAt: new Date("2026-09-02"),
    reimbursementId: "ORIG",
    reason: "Lost_Warehouse",
    sku: "SKU",
    amountTotal: "20.45",
    currency: "USD",
    quantityCash: 1,
    quantityInventory: 0,
    quantityTotal: 1
  }
  const reversal = {
    ...original,
    approvedAt: new Date("2026-10-02"),
    reimbursementId: "REV",
    originalReimbursementId: "ORIG",
    originalReimbursementType: "Lost_Warehouse",
    reason: "Reimbursement_Reversal",
    amountTotal: "-20.45",
    quantityCash: -1,
    quantityInventory: 1,
    quantityTotal: 0
  }
  await database
    .insert(tables.amazonReimbursements)
    .values([original, reversal, { ...reversal, externalAccountId: "SELLER2" }, { ...reversal, orgId: otherId }])
  const result = await amazonReconciliation(orgId, { ...input, source: "reimbursements" })
  expect(result.rows).toHaveLength(1)
  expect(result.rows[0]?.reimbursementAccounting).toMatchObject({
    status: "report_family_calculated",
    signedReportAmounts: [{ currency: "USD", amount: "0.00" }],
    quantities: { cash: 0, inventory: 1, total: 1 }
  })
  expect(result.relatedReimbursements).toHaveLength(2)
  await database.insert(tables.amazonReimbursements).values({
    ...reversal,
    reimbursementId: "REV2",
    originalReimbursementId: "REV",
    approvedAt: new Date("2026-12-01")
  })
  const updated = await amazonReconciliation(orgId, { ...input, source: "reimbursements" })
  expect(updated.relatedReimbursements).toHaveLength(3)
  expect(updated.rows[0]?.reimbursementAccounting?.blockers).toContain("multi_step_chain_requires_review")
})

it("discloses a truncated reimbursement family instead of returning a partial net", async () => {
  const base = {
    orgId,
    externalAccountId: "SELLER1",
    marketplaceId: "ATVPDKIKX0DER",
    sku: "SKU",
    amountTotal: "1",
    currency: "USD",
    quantityCash: 1,
    quantityInventory: 0,
    quantityTotal: 1
  }
  await database
    .insert(tables.amazonReimbursements)
    .values({ ...base, reimbursementId: "ROOT", approvedAt: new Date("2026-10-01") })
  await database.insert(tables.amazonReimbursements).values(
    Array.from({ length: 1001 }, (_, index) => ({
      ...base,
      reimbursementId: `CHILD-${index}`,
      originalReimbursementId: "ROOT",
      approvedAt: new Date("2026-11-01")
    }))
  )
  const result = await amazonReconciliation(orgId, { ...input, source: "reimbursements" })
  expect(result.relatedReimbursementsTruncated).toBe(true)
  expect(result.rows[0]?.reimbursementAccounting).toMatchObject({
    signedReportAmounts: null,
    quantities: null,
    blockers: expect.arrayContaining(["related_records_truncated"])
  })
  await database.insert(tables.amazonReimbursements).values({
    ...base,
    reimbursementId: "LATEST",
    originalReimbursementId: "ROOT",
    approvedAt: new Date("2026-12-01")
  })
  const latest = await amazonReconciliation(orgId, {
    ...input,
    source: "reimbursements",
    from: "2026-12-01",
    to: "2027-01-01"
  })
  expect(latest.rows).toHaveLength(1)
  expect(latest.relatedReimbursements).toHaveLength(1000)
  expect(latest.rows[0]?.reimbursementAccounting).toMatchObject({
    status: "requires_review",
    signedReportAmounts: null,
    blockers: expect.arrayContaining(["related_records_truncated"])
  })
})
