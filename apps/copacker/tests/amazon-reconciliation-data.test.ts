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
    for (let batch = 0; batch < 6; batch++) {
      await database.insert(tables.amazonTransactions).values(
        Array.from({ length: batch === 5 ? 1 : 1000 }, (_, index) => ({
          orgId,
          externalAccountId: "SELLER1",
          transactionId: `T${batch}-${index}`,
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
