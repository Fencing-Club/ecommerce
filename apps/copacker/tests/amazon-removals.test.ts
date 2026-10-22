import { randomUUID } from "node:crypto"
import { type Amazon, ProviderError } from "@repo/copacker-marketplaces/amazon"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { removalReport } from "./fixtures/amazon-removals"
import { database, setUpTestDatabase } from "./test-db"
vi.mock("@/db", () => import("./test-db"))
import { amazonRemovalsStatus, syncAmazonRemovals } from "../src/server/amazon-removals"

const orgId = randomUUID(),
  otherId = randomUUID()
const now = new Date("2026-10-16T12:00:00Z")
const report = vi.fn<Amazon["report"]>()
const owned = vi.fn<() => Promise<void>>()
const input = { orgId, externalAccountId: "SELLER1", revision: 1, amazon: { report } }
setUpTestDatabase({ truncate: true })
beforeEach(async () => {
  vi.resetAllMocks()
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
  report.mockImplementation(async (request) => {
    const kind = request.reportType === "GET_FBA_FULFILLMENT_REMOVAL_ORDER_DETAIL_DATA" ? "orders" : "shipments"
    return removalReport(kind, [
      {},
      kind === "orders" ? { "order-type": "Disposal", disposition: "SELLABLE" } : { "tracking-number": "TRACK2" }
    ])
  })
})
const sync = (kind: "orders" | "shipments", date = now) => syncAmazonRemovals(input, kind, owned, date)
const status = (kind: "orders" | "shipments", date = now) => amazonRemovalsStatus(orgId, "SELLER1", kind, date)
describe("Amazon removal evidence", () => {
  it("backfills each source independently and keeps overlapping quantities out of stock/profit", async () => {
    await sync("orders")
    await sync("shipments")
    expect(report).toHaveBeenCalledTimes(2)
    expect(report.mock.calls[0]?.[0]).toEqual({
      reportType: "GET_FBA_FULFILLMENT_REMOVAL_ORDER_DETAIL_DATA",
      marketplaceIds: ["ATVPDKIKX0DER"],
      dataStartTime: "2025-10-01T00:00:00.000Z",
      dataEndTime: "2026-10-15T23:59:59.000Z"
    })
    const rows = await database.select().from(tables.amazonRemovals)
    expect(rows).toHaveLength(4)
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "orders",
          orderId: "REM1",
          orderType: "Disposal",
          disposedQuantity: 3,
          removalFee: "2.123456789"
        }),
        expect.objectContaining({
          kind: "shipments",
          requestedAt: new Date("2026-08-01T10:00:00Z"),
          shippedAt: new Date("2026-10-05T12:00:00Z"),
          trackingNumber: "TRACK2",
          removalFee: null,
          disposedQuantity: null
        })
      ])
    )
    expect((await status("orders")).windows.every((window) => window.complete)).toBe(true)
    expect((await status("shipments")).dateBasis).toBe("shipment")
    expect(await database.select().from(tables.amazonTransactions)).toEqual([])
    expect(await database.select().from(tables.stockDays)).toEqual([])
    report.mockClear()
    await sync("orders")
    await sync("shipments")
    expect(report).toHaveBeenCalledTimes(2)
    expect(await database.select().from(tables.amazonRemovals)).toHaveLength(4)
  })
  it("replaces corrected and removed evidence, preserves identical rows and isolates source/account/workspace/marketplace", async () => {
    const row = {
      requestedAt: new Date("2026-10-02"),
      orderId: "OTHER",
      kind: "orders" as const,
      marketplaceId: "ATVPDKIKX0DER"
    }
    await database.insert(tables.amazonRemovals).values([
      { ...row, orgId: otherId, externalAccountId: "SELLER1" },
      { ...row, orgId, externalAccountId: "SELLER2" },
      { ...row, orgId, externalAccountId: "SELLER1", marketplaceId: "OTHER" }
    ])
    await sync("shipments")
    report.mockResolvedValue(
      removalReport(
        "orders",
        Array.from({ length: 501 }, () => ({ "disposed-quantity": "8", "removal-fee": "-0.000001" }))
      )
    )
    await sync("orders")
    await sync("orders")
    expect(await database.select().from(tables.amazonRemovals)).toHaveLength(506)
    report.mockResolvedValue(removalReport("orders"))
    await sync("orders")
    expect(await database.select().from(tables.amazonRemovals)).toHaveLength(5)
    expect((await status("orders")).windows[0]).toMatchObject({ complete: true, rows: 0 })
    expect((await status("shipments")).windows[0]).toMatchObject({ complete: true, rows: 2 })
    expect(
      (await amazonRemovalsStatus(otherId, "SELLER1", "orders", now)).windows.every((window) => window.rows === null)
    ).toBe(true)
  })
  it("keeps prior evidence after cancellation, malformed values and out-of-window dates", async () => {
    await sync("orders")
    for (const response of [
      null,
      removalReport("orders", [{ "disposed-quantity": "bad" }]),
      removalReport("orders", [{ "request-date": "2026-11-01T00:00:00Z" }])
    ]) {
      report.mockResolvedValue(response)
      await sync("orders")
      expect(await database.select().from(tables.amazonRemovals)).toHaveLength(2)
      expect((await status("orders")).windows[0]).toMatchObject({
        complete: false,
        rows: 2,
        coveredTo: "2026-10-16T00:00:00.000Z",
        status: response === null ? "unavailable" : "failed",
        errorCode:
          response === null
            ? "report_cancelled"
            : "report_" + (response.includes("bad") ? "invalid_document" : "outside_period")
      })
    }
    report.mockResolvedValue(removalReport("shipments"))
    await sync("shipments")
    expect((await status("shipments")).windows.every((window) => window.complete)).toBe(true)
  })
  it("validates the entire shipment file by shipment date and never publishes part of an invalid range", async () => {
    report.mockResolvedValue(removalReport("shipments", [{}, { "shipment-date": "2025-09-30T23:59:59Z" }]))
    await sync("shipments")
    expect(await database.select().from(tables.amazonRemovals)).toEqual([])
    const state = await status("shipments")
    expect(state.windows[0]).toMatchObject({ complete: false, rows: null, status: "failed" })
    expect(state.windows.every((window) => !window.complete)).toBe(true)
  })
  it("refreshes older order corrections by request month even when last updated later", async () => {
    await sync("orders")
    report.mockClear()
    report.mockResolvedValue(
      removalReport("orders", [
        {
          "request-date": "2026-05-01T00:00:00Z",
          "last-updated-date": "2026-10-15T00:00:00Z",
          "order-status": "Completed"
        }
      ])
    )
    await sync("orders")
    expect(report).toHaveBeenCalledTimes(1)
    expect(await database.select().from(tables.amazonRemovals)).toMatchObject([
      { requestedAt: new Date("2026-05-01"), status: "Completed" }
    ])
    expect((await status("orders", new Date("2026-10-17"))).windows[0]?.complete).toBe(false)
  })
  it("rejects publication after revision replacement, disconnect or lost lease", async () => {
    report.mockImplementationOnce(async () => {
      await database.update(tables.salesSyncs).set({ revision: 2 }).where(eq(tables.salesSyncs.orgId, orgId))
      return removalReport("orders", [{}])
    })
    await expect(sync("orders")).rejects.toThrow("superseded")
    await database.update(tables.salesSyncs).set({ revision: 1 }).where(eq(tables.salesSyncs.orgId, orgId))
    owned.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Lease lost"))
    await expect(sync("shipments")).rejects.toThrow("Lease lost")
    owned.mockReset()
    report.mockImplementationOnce(async () => {
      await database.delete(tables.connections).where(eq(tables.connections.orgId, orgId))
      return removalReport("orders", [{}])
    })
    await expect(sync("orders")).rejects.toThrow("superseded")
    expect(await database.select().from(tables.amazonRemovals)).toEqual([])
    expect(await database.select().from(tables.amazonRemovalReports)).toEqual([])
  })
  it.each([403, 429])("stops inaccessible/throttled reports after one attempt (%s)", async (code) => {
    report.mockRejectedValue(new ProviderError(code, null, "provider failure"))
    await sync("orders")
    expect(report).toHaveBeenCalledTimes(1)
    expect((await status("orders")).windows[0]).toMatchObject({
      complete: false,
      rows: null,
      errorCode: code === 403 ? "report_access_denied" : "report_throttled"
    })
  })

  it("partitions a complete date-range report into months without discarding older stored history", async () => {
    await database.insert(tables.amazonRemovals).values({
      orgId,
      externalAccountId: "SELLER1",
      marketplaceId: "ATVPDKIKX0DER",
      kind: "orders",
      requestedAt: new Date("2025-09-02"),
      orderId: "OLDER"
    })
    report.mockResolvedValue(
      removalReport("orders", [
        { "request-date": "2025-10-01T00:00:00Z" },
        { "request-date": "2026-05-15T12:00:00Z" },
        { "request-date": "2026-10-15T23:59:59Z" }
      ])
    )
    await sync("orders")
    const windows = (await status("orders")).windows
    expect(windows.every((window) => window.complete)).toBe(true)
    expect(windows.filter((window) => window.rows === 1).map((window) => window.from)).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-05-01T00:00:00.000Z",
      "2025-10-01T00:00:00.000Z"
    ])
    expect(windows.filter((window) => window.rows === 0)).toHaveLength(10)
    expect(await database.select().from(tables.amazonRemovals)).toHaveLength(4)
  })
})
