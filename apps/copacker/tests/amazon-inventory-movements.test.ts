import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { type Amazon, ProviderError } from "@repo/aisle/amazon"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { applySchema } from "./database"
import { inventoryMovementReport } from "./fixtures/amazon-inventory-movements"
const context = vi.hoisted(() => ({ database: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.database }))
import { amazonInventoryMovementsStatus, syncAmazonInventoryMovements } from "../src/server/amazon-inventory-movements"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const orgId = randomUUID(),
  otherId = randomUUID()
const now = new Date("2026-10-16T12:00:00Z")
const report = vi.fn<Amazon["report"]>()
const owned = vi.fn<() => Promise<void>>()
const input = { orgId, externalAccountId: "SELLER1", revision: 1, amazon: { report } }
beforeAll(async () => {
  context.database = database
  await applySchema(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  vi.resetAllMocks()
  await pg.exec("TRUNCATE organizations CASCADE")
  await database.insert(tables.organizations).values([
    { id: orgId, kind: "buyer", name: "Buyer" },
    { id: otherId, kind: "buyer", name: "Other" }
  ])
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId: "SELLER1", encryptedToken: "test" })
  await database
    .insert(tables.salesSyncs)
    .values({ orgId, source: "amazon", externalAccountId: "SELLER1", revision: 1, status: "running" })
  report.mockImplementation(async (request) =>
    inventoryMovementReport(
      request.dataStartTime.startsWith("2026-10")
        ? [
            {},
            { "Event Type": "Receipts", Quantity: "20" },
            { "Event Type": "WhseTransfers", Quantity: "-2", "Fulfillment Center": "FC1" },
            { "Event Type": "WhseTransfers", Quantity: "2", "Fulfillment Center": "FC2" },
            { "Event Type": "NEW_EVENT", Quantity: "0", MSKU: "", "Reference ID": "" }
          ]
        : []
    )
  )
})

describe("detailed Amazon inventory movements", () => {
  it("backfills all event types, preserving transfers and unmatched evidence without changing stock or money", async () => {
    await syncAmazonInventoryMovements(input, owned, now)
    expect(report).toHaveBeenCalledTimes(13)
    expect(report.mock.calls[0]?.[0]).toEqual({
      reportType: "GET_LEDGER_DETAIL_VIEW_DATA",
      marketplaceIds: ["ATVPDKIKX0DER"],
      dataStartTime: "2026-10-01T00:00:00.000Z",
      dataEndTime: "2026-10-15T23:59:59.000Z"
    })
    const rows = await database.select().from(tables.amazonInventoryMovements)
    expect(rows).toHaveLength(5)
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventDay: "2026-10-02",
          quantity: -3,
          reason: "M",
          reconciledQuantity: 1,
          unreconciledQuantity: 2
        }),
        expect.objectContaining({ eventType: "WhseTransfers", quantity: -2, fulfillmentCenterId: "FC1" }),
        expect.objectContaining({ eventType: "WhseTransfers", quantity: 2, fulfillmentCenterId: "FC2" }),
        expect.objectContaining({ eventType: "NEW_EVENT", sku: null, referenceId: null })
      ])
    )
    expect(await database.select().from(tables.stockDays)).toEqual([])
    expect(await database.select().from(tables.stockSnapshots)).toEqual([])
    expect(await database.select().from(tables.amazonTransactions)).toEqual([])
    expect(
      (await amazonInventoryMovementsStatus(orgId, "SELLER1", now)).windows.every((window) => window.complete)
    ).toBe(true)
    report.mockClear()
    await syncAmazonInventoryMovements(input, owned, now)
    expect(report).toHaveBeenCalledTimes(2)
    expect(await database.select().from(tables.amazonInventoryMovements)).toHaveLength(5)
  })

  it("replaces corrected/removed records and keeps identical source rows across insert batches", async () => {
    report.mockImplementation(async (request) =>
      inventoryMovementReport(
        request.dataStartTime.startsWith("2026-10") ? Array.from({ length: 501 }, () => ({ Quantity: "1" })) : []
      )
    )
    await syncAmazonInventoryMovements(input, owned, now)
    await syncAmazonInventoryMovements(input, owned, now)
    expect(await database.select().from(tables.amazonInventoryMovements)).toHaveLength(501)
    report.mockImplementation(async (request) =>
      inventoryMovementReport(
        request.dataStartTime.startsWith("2026-10")
          ? [{ "Reconciled Quantity": "3", "Unreconciled Quantity": "0" }]
          : []
      )
    )
    await syncAmazonInventoryMovements(input, owned, now)
    expect(await database.select().from(tables.amazonInventoryMovements)).toMatchObject([
      { quantity: -3, reconciledQuantity: 3, unreconciledQuantity: 0 }
    ])
    report.mockResolvedValue(inventoryMovementReport())
    await syncAmazonInventoryMovements(input, owned, now)
    expect(await database.select().from(tables.amazonInventoryMovements)).toEqual([])
    expect((await amazonInventoryMovementsStatus(orgId, "SELLER1", now)).windows[0]).toMatchObject({
      complete: true,
      rows: 0
    })
  })

  it("preserves prior evidence on cancellation and rejects a malformed month atomically", async () => {
    await syncAmazonInventoryMovements(input, owned, now)
    report.mockImplementation(async (request) =>
      request.dataStartTime.startsWith("2026-10")
        ? null
        : inventoryMovementReport([{ Date: "2026-09-02", Quantity: "bad" }])
    )
    await syncAmazonInventoryMovements(input, owned, now)
    expect(await database.select().from(tables.amazonInventoryMovements)).toHaveLength(5)
    const status = await amazonInventoryMovementsStatus(orgId, "SELLER1", now)
    expect(status.windows[0]).toMatchObject({ complete: false, status: "unavailable", rows: 5 })
    expect(status.windows[1]).toMatchObject({ complete: false, status: "failed", rows: 0 })
  })

  it("does not mark out-of-window or invalid records as complete and still imports older valid months", async () => {
    report.mockImplementation(async (request) =>
      inventoryMovementReport(request.dataStartTime.startsWith("2026-10") ? [{}, { Date: "2026-09-30" }] : [])
    )
    await syncAmazonInventoryMovements(input, owned, now)
    expect(await database.select().from(tables.amazonInventoryMovements)).toEqual([])
    const status = await amazonInventoryMovementsStatus(orgId, "SELLER1", now)
    expect(status.windows[0]).toMatchObject({ status: "failed", coveredTo: null, rows: null })
    expect(status.windows.slice(1).every((window) => window.complete)).toBe(true)
  })

  it("isolates workspace/account/marketplace replacements and hides unrelated coverage", async () => {
    const row = { marketplaceId: "ATVPDKIKX0DER", eventDay: "2026-10-02", eventType: "Receipts", quantity: 99 }
    await database.insert(tables.amazonInventoryMovements).values([
      { ...row, orgId: otherId, externalAccountId: "SELLER1" },
      { ...row, orgId, externalAccountId: "SELLER2" },
      { ...row, orgId, externalAccountId: "SELLER1", marketplaceId: "OTHER" }
    ])
    await syncAmazonInventoryMovements(input, owned, now)
    report.mockResolvedValue(inventoryMovementReport())
    await syncAmazonInventoryMovements(input, owned, now)
    const rows = await database.select().from(tables.amazonInventoryMovements)
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.quantity === 99)).toBe(true)
    expect(
      (await amazonInventoryMovementsStatus(otherId, "SELLER1", now)).windows.every((window) => window.rows === null)
    ).toBe(true)
    expect(
      (await amazonInventoryMovementsStatus(orgId, "SELLER2", now)).windows.every((window) => window.rows === null)
    ).toBe(true)
  })

  it("rejects stale publication after revision replacement and lost leases", async () => {
    report.mockImplementationOnce(async () => {
      await database.update(tables.salesSyncs).set({ revision: 2 }).where(eq(tables.salesSyncs.orgId, orgId))
      return inventoryMovementReport([{}])
    })
    await expect(syncAmazonInventoryMovements(input, owned, now)).rejects.toThrow("superseded")
    expect(await database.select().from(tables.amazonMovementReports)).toEqual([])
    await database.update(tables.salesSyncs).set({ revision: 1 }).where(eq(tables.salesSyncs.orgId, orgId))
    owned.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Lease lost"))
    await expect(syncAmazonInventoryMovements(input, owned, now)).rejects.toThrow("Lease lost")
    expect(await database.select().from(tables.amazonInventoryMovements)).toEqual([])
  })

  it("refreshes old corrections and marks the current month incomplete when the day advances", async () => {
    await syncAmazonInventoryMovements(input, owned, now)
    await database
      .update(tables.amazonMovementReports)
      .set({ checkedAt: new Date("2026-08-01") })
      .where(eq(tables.amazonMovementReports.from, new Date("2026-05-01")))
    const tomorrow = new Date("2026-10-17T12:00:00Z")
    expect((await amazonInventoryMovementsStatus(orgId, "SELLER1", tomorrow)).windows[0]?.complete).toBe(false)
    report.mockClear()
    await syncAmazonInventoryMovements(input, owned, tomorrow)
    expect(report).toHaveBeenCalledTimes(3)
    expect((await amazonInventoryMovementsStatus(orgId, "SELLER1", tomorrow)).windows[0]?.complete).toBe(true)
  })

  it("records permission failure without repeatedly requesting inaccessible older months", async () => {
    report.mockRejectedValue(new ProviderError(403, null, "access denied"))
    await syncAmazonInventoryMovements(input, owned, now)
    expect(report).toHaveBeenCalledTimes(1)
    expect((await amazonInventoryMovementsStatus(orgId, "SELLER1", now)).windows[0]).toMatchObject({
      complete: false,
      rows: null,
      errorCode: "report_access_denied"
    })
  })
})
