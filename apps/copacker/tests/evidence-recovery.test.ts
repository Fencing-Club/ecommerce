import { randomUUID } from "node:crypto"
import type { Amazon } from "@repo/copacker-marketplaces/amazon"
import type { Shopify } from "@repo/copacker-marketplaces/shopify"
import { eq } from "drizzle-orm"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { inventoryMovementReport } from "./fixtures/amazon-inventory-movements"
import { reimbursementReport } from "./fixtures/amazon-reimbursements"
import { database, setUpTestDatabase } from "./test-db"
vi.mock("@/db", () => import("./test-db"))
const clients = vi.hoisted(() => ({ graphql: vi.fn<Shopify["graphql"]>(), report: vi.fn<Amazon["report"]>() }))
vi.mock("../src/server/connections", () => ({
  shopifyFor: async () => ({ graphql: clients.graphql }),
  amazonFor: async () => ({ report: clients.report })
}))
import { evidenceRecoveryJob } from "../src/server/evidence-recovery"
import { recoveryWindows } from "../src/server/evidence-recovery-plan"
const orgId = randomUUID(),
  otherId = randomUUID()
const owned = { assertOwned: async () => undefined }
const input = { orgId, source: "shopify" as const, externalAccountId: "shop", revision: 1 }
const amazon = { ...input, source: "amazon" as const, externalAccountId: "seller" }
setUpTestDatabase({ truncate: true })
beforeEach(async () => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-22T12:00:00Z"))
  await database.insert(tables.organizations).values([
    { id: orgId, kind: "buyer", name: "Buyer" },
    { id: otherId, kind: "buyer", name: "Other" }
  ])
  for (const account of [input, amazon]) {
    await database.insert(tables.connections).values({
      orgId,
      provider: account.source,
      externalId: account.externalAccountId,
      encryptedToken: "test",
      scopes: "read_orders"
    })
    await database.insert(tables.salesSyncs).values(account)
  }
})
afterEach(() => vi.useRealTimers())
async function balance(orderId: string, workspace = orgId, account = "shop") {
  await database.insert(tables.shopifyBalanceTransactions).values({
    orgId: workspace,
    externalAccountId: account,
    orderId,
    transactionId: randomUUID(),
    type: "charge",
    processedAt: new Date(),
    currency: "USD",
    amountMinor: 100,
    feeMinor: 0,
    netMinor: 100,
    data: {}
  })
}
async function reversal() {
  await database.insert(tables.amazonReimbursements).values({
    orgId,
    externalAccountId: "seller",
    marketplaceId: "ATVPDKIKX0DER",
    approvedAt: new Date("2026-09-20"),
    reimbursementId: "reversal",
    originalReimbursementId: "original"
  })
}
async function state(id: string) {
  return (
    await database
      .select()
      .from(tables.analyticsFeeds)
      .where(eq(tables.analyticsFeeds.dataset, `recovery:${id}`))
  )[0]?.state.recovery
}
it("fetches only the referenced Shopify order, preserves discovery coverage, and rechecks saved evidence", async () => {
  await balance("gid://shopify/Order/1")
  await balance("wrong-workspace", otherId)
  await balance("wrong-account", orgId, "other-shop")
  const coverage = { coveredFrom: "2025-01-01T00:00:00Z", coveredTo: "2026-10-20T00:00:00Z", after: "saved-cursor" }
  await database.insert(tables.analyticsFeeds).values({ ...input, dataset: "order_economics", state: coverage })
  clients.graphql.mockResolvedValue({
    order: {
      id: "gid://shopify/Order/1",
      updatedAt: "2026-01-01T00:00:00Z",
      test: false,
      tags: [],
      transactions: [],
      refunds: []
    }
  })
  await evidenceRecoveryJob(input, owned)
  expect(clients.graphql).toHaveBeenCalledTimes(2)
  expect(clients.graphql.mock.calls.every((call) => call[1]?.id === "gid://shopify/Order/1")).toBe(true)
  expect(await state("order:gid://shopify/Order/1")).toMatchObject({ status: "resolved", attempts: 1 })
  expect(
    (await database.select().from(tables.analyticsFeeds).where(eq(tables.analyticsFeeds.dataset, "order_economics")))[0]
      ?.state
  ).toEqual(coverage)
  await evidenceRecoveryJob(input, owned)
  expect(clients.graphql).toHaveBeenCalledTimes(2)
})
it("stops an unavailable Shopify lookup after three daily attempts, including repeated manual syncs", async () => {
  await balance("missing")
  clients.graphql.mockResolvedValue({ order: null })
  for (let day = 22; day <= 26; day++) {
    vi.setSystemTime(new Date(`2026-10-${day}T12:00:00Z`))
    await evidenceRecoveryJob(input, owned)
    await evidenceRecoveryJob(input, owned)
  }
  expect(clients.graphql).toHaveBeenCalledTimes(3)
  expect(await state("order:missing")).toMatchObject({ attempts: 3, status: "exhausted" })
  expect(await database.select().from(tables.analyticsEvidence)).toHaveLength(0)
})
it("refuses a lookup under a superseded sync revision", async () => {
  await balance("missing")
  await expect(evidenceRecoveryJob({ ...input, revision: 2 }, owned)).rejects.toThrow("Sync superseded")
  expect(clients.graphql).not.toHaveBeenCalled()
})
it("does not publish an order returned after disconnect", async () => {
  await balance("missing")
  clients.graphql.mockImplementation(async () => {
    await database.delete(tables.connections).where(eq(tables.connections.provider, "shopify"))
    return {
      order: { id: "missing", updatedAt: "2026-01-01T00:00:00Z", test: false, tags: [], transactions: [], refunds: [] }
    }
  })
  await expect(evidenceRecoveryJob(input, owned)).rejects.toThrow("Sync superseded")
  expect(await database.select().from(tables.analyticsEvidence)).toHaveLength(0)
})
it("recovers one Amazon month, records its coverage and resolves the missing original without adding money", async () => {
  await reversal()
  clients.report.mockResolvedValue(
    reimbursementReport([
      { "approval-date": "2026-09-01T00:00:00Z", "reimbursement-id": "original" },
      {
        "approval-date": "2026-09-20T00:00:00Z",
        "reimbursement-id": "reversal",
        "original-reimbursement-id": "original"
      }
    ])
  )
  await evidenceRecoveryJob(amazon, owned)
  expect(clients.report).toHaveBeenCalledTimes(1)
  expect(clients.report.mock.calls[0]?.[0]).toMatchObject({
    dataStartTime: "2026-09-01T00:00:00.000Z",
    dataEndTime: "2026-09-30T23:59:59.000Z"
  })
  expect(await state("original:original")).toMatchObject({ status: "resolved" })
  expect((await database.select().from(tables.amazonReimbursementReports))[0]).toMatchObject({
    status: "imported",
    rowCount: 2
  })
  expect(await database.select().from(tables.amazonTransactions)).toHaveLength(0)
  await evidenceRecoveryJob(amazon, owned)
  expect(clients.report).toHaveBeenCalledTimes(1)
})
it("preserves an unavailable month and moves to another bounded month on the next day", async () => {
  await reversal()
  clients.report.mockResolvedValue(null)
  await evidenceRecoveryJob(amazon, owned)
  await evidenceRecoveryJob(amazon, owned)
  expect(clients.report).toHaveBeenCalledTimes(1)
  expect((await database.select().from(tables.amazonReimbursementReports))[0]).toMatchObject({
    status: "unavailable",
    coveredTo: null
  })
  vi.setSystemTime(new Date("2026-10-23T12:00:00Z"))
  await evidenceRecoveryJob(amazon, owned)
  expect(clients.report.mock.calls[1]?.[0].dataStartTime).toBe("2026-08-01T00:00:00.000Z")
  expect(await state("original:original")).toMatchObject({ status: "unresolved", attempts: 2 })
})
it("bounds searches to six completed months and excludes old ledger history", () => {
  const now = new Date("2026-10-22")
  expect(recoveryWindows("2026-10-01", now, false)).toHaveLength(5)
  expect(recoveryWindows("2026-09-01", now, false)).toHaveLength(6)
  expect(recoveryWindows("2024-01-01", now, true)).toEqual([])
  expect(recoveryWindows("2025-05-01", now, true)).toHaveLength(1)
  expect(recoveryWindows("bad", now, false)).toEqual([])
})

it("keeps a missing original unresolved if a later report omits its reversal", async () => {
  await reversal()
  clients.report.mockResolvedValue(reimbursementReport([]))
  await evidenceRecoveryJob(amazon, owned)
  expect(await state("original:original")).toMatchObject({ status: "unresolved" })
  expect(await database.select().from(tables.amazonReimbursements)).toHaveLength(0)
  vi.setSystemTime(new Date("2026-10-23T12:00:00Z"))
  await evidenceRecoveryJob(amazon, owned)
  expect(clients.report).toHaveBeenCalledTimes(2)
  expect(await state("original:original")).toMatchObject({ status: "unresolved", attempts: 2 })
})

it("does not infer a receipt date from a shipment name", async () => {
  await database.insert(tables.analyticsEvidence).values({
    orgId,
    source: "amazon",
    externalAccountId: "seller",
    dataset: "fba_inbound_receipts",
    sourceId: "shipment",
    data: {
      status: "CLOSED",
      shipmentName: "FBA September 2026",
      items: [{ sku: "sku", sent: 10, received: 10, unit: "UNITS" }]
    }
  })
  await evidenceRecoveryJob(amazon, owned)
  expect(clients.report).not.toHaveBeenCalled()
  expect(await state("receipt:shipment")).toMatchObject({ status: "exhausted", outcome: "dated_reference_required" })
})

it("recovers a missing receipt month using an actual saved event and rechecks the quantity", async () => {
  await database.insert(tables.analyticsEvidence).values({
    orgId,
    source: "amazon",
    externalAccountId: "seller",
    dataset: "fba_inbound_receipts",
    sourceId: "shipment",
    data: { status: "CLOSED", items: [{ sku: "SKU1", sent: 10, received: 10, unit: "UNITS" }] }
  })
  await database.insert(tables.amazonInventoryMovements).values({
    orgId,
    externalAccountId: "seller",
    marketplaceId: "ATVPDKIKX0DER",
    referenceId: "shipment",
    sku: "SKU1",
    eventType: "Receipts",
    eventDay: "2026-10-01",
    quantity: 8
  })
  clients.report.mockResolvedValue(
    inventoryMovementReport([
      {
        Date: "2026-09-01",
        "Date and Time": "09/01/2026 12:30:00",
        "Reference ID": "shipment",
        "Event Type": "Receipts",
        Quantity: "2"
      }
    ])
  )
  await evidenceRecoveryJob(amazon, owned)
  expect(clients.report).toHaveBeenCalledTimes(1)
  expect(clients.report.mock.calls[0]?.[0].dataStartTime).toBe("2026-09-01T00:00:00.000Z")
  expect(await state("receipt:shipment")).toMatchObject({ status: "resolved" })
  expect(
    (await database.select().from(tables.amazonInventoryMovements)).reduce((total, row) => total + row.quantity, 0)
  ).toBe(10)
  expect(await database.select().from(tables.inventoryBasisRecords)).toHaveLength(0)
})

it("shares the daily budget across targets and revisions", async () => {
  await reversal()
  await database.insert(tables.amazonReimbursements).values({
    orgId,
    externalAccountId: "seller",
    marketplaceId: "ATVPDKIKX0DER",
    approvedAt: new Date("2026-08-20"),
    reimbursementId: "reversal2",
    originalReimbursementId: "original2"
  })
  clients.report.mockResolvedValue(null)
  await evidenceRecoveryJob(amazon, owned)
  await database.update(tables.salesSyncs).set({ revision: 2 }).where(eq(tables.salesSyncs.source, "amazon"))
  await evidenceRecoveryJob({ ...amazon, revision: 2 }, owned)
  expect(clients.report).toHaveBeenCalledTimes(1)
})

it("does not spend attempts or the daily request budget on an unsearchable target", async () => {
  await reversal()
  await database.insert(tables.amazonReimbursements).values({
    orgId,
    externalAccountId: "seller",
    marketplaceId: "ATVPDKIKX0DER",
    approvedAt: new Date("2023-08-20"),
    reimbursementId: "old-reversal",
    originalReimbursementId: "aaa-old"
  })
  clients.report.mockResolvedValue(null)
  await evidenceRecoveryJob(amazon, owned)
  expect(await state("original:aaa-old")).toMatchObject({
    attempts: 0,
    status: "exhausted",
    outcome: "bounded_search_exhausted"
  })
  expect(await state("original:original")).toMatchObject({ attempts: 1 })
  expect(clients.report).toHaveBeenCalledTimes(1)
})
