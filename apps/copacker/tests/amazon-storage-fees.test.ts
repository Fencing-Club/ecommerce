import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { type Amazon, ProviderError } from "@repo/aisle/amazon"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { monthlyStorageReport, agedStorageReport } from "./fixtures/amazon-storage-fees"
import { applyMigrations } from "./migrations"
const context = vi.hoisted(() => ({ database: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.database }))
import { monthlyReportWindows } from "../src/server/amazon-report-sync"
import { amazonStorageFeesStatus, syncAmazonStorageFees } from "../src/server/amazon-storage-fees"

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
  await applyMigrations(pg)
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
    request.reportType === "GET_FBA_STORAGE_FEE_CHARGES_DATA"
      ? monthlyStorageReport(
          request.dataStartTime.startsWith("2026-09")
            ? [{}, { fulfillment_center: "FC2", currency: "CAD", country_code: "CA" }]
            : []
        )
      : agedStorageReport(request.dataStartTime.startsWith("2026-09") ? [{}, { "surcharge-age-tier": "365+" }] : [])
  )
})
const sync = (kind: "monthly" | "aged", date = now) => syncAmazonStorageFees(input, kind, owned, date)
const status = (kind: "monthly" | "aged", date = now) => amazonStorageFeesStatus(orgId, "SELLER1", kind, date)
describe("Amazon storage acquisition", () => {
  it("backfills twelve completed months for each source with exact decimals and separate cost bases", async () => {
    await sync("monthly")
    await sync("aged")
    expect(report).toHaveBeenCalledTimes(24)
    expect(report.mock.calls[0]?.[0]).toEqual({
      reportType: "GET_FBA_STORAGE_FEE_CHARGES_DATA",
      marketplaceIds: ["ATVPDKIKX0DER"],
      dataStartTime: "2026-09-01T00:00:00.000Z",
      dataEndTime: "2026-10-01T00:00:00.000Z"
    })
    const rows = await database.select().from(tables.amazonStorageFees)
    expect(rows).toHaveLength(4)
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "monthly",
          basis: "estimate",
          amount: "12.345678901",
          quantity: "2.75",
          sku: null,
          fulfillmentCenterId: "FC1",
          data: expect.objectContaining({ est_base_msf: "10" })
        }),
        expect.objectContaining({ kind: "monthly", currency: "CAD", country: "CA", fulfillmentCenterId: "FC2" }),
        expect.objectContaining({
          kind: "aged",
          basis: "reported_charge",
          amount: "4.123456789",
          ageTier: "365+",
          fulfillmentCenterId: null
        })
      ])
    )
    expect(await database.select().from(tables.amazonTransactions)).toEqual([])
    expect((await status("monthly")).windows.every((window) => window.complete)).toBe(true)
    expect((await status("aged")).basis).toBe("reported_charge")
    report.mockClear()
    await sync("monthly")
    await sync("aged")
    expect(report).toHaveBeenCalledTimes(4)
    expect(await database.select().from(tables.amazonStorageFees)).toHaveLength(4)
  })
  it.each(["2024-03-01T00:00:00Z", "2026-01-01T00:00:00Z"])(
    "requests full calendar months across leap years and year boundaries: %s",
    async (date) => {
      report.mockResolvedValue(agedStorageReport())
      const at = new Date(date)
      await sync("aged", at)
      const windows = monthlyReportWindows(at, true)
      expect(windows).toHaveLength(12)
      expect(report.mock.calls.map(([request]) => [request.dataStartTime, request.dataEndTime])).toEqual(
        windows.map((window) => [window.from.toISOString(), window.to.toISOString()])
      )
      expect(windows[0]?.to.toISOString()).toBe(at.toISOString())
      expect(windows[0]?.from.toISOString()).toBe(
        date.startsWith("2024") ? "2024-02-01T00:00:00.000Z" : "2025-12-01T00:00:00.000Z"
      )
    }
  )
  it("replaces corrections and removed rows without erasing another kind or workspace/account/marketplace", async () => {
    const row = {
      periodDay: "2026-09-01",
      kind: "monthly" as const,
      basis: "estimate" as const,
      marketplaceId: "ATVPDKIKX0DER",
      amount: "99",
      data: {}
    }
    await database.insert(tables.amazonStorageFees).values([
      { ...row, orgId: otherId, externalAccountId: "SELLER1" },
      { ...row, orgId, externalAccountId: "SELLER2" },
      { ...row, orgId, externalAccountId: "SELLER1", marketplaceId: "OTHER" }
    ])
    await sync("aged")
    report.mockImplementation(async (request) =>
      monthlyStorageReport(
        request.dataStartTime.startsWith("2026-09")
          ? Array.from({ length: 501 }, () => ({ estimated_monthly_storage_fee: "-0.000001" }))
          : []
      )
    )
    await sync("monthly")
    await sync("monthly")
    expect(await database.select().from(tables.amazonStorageFees)).toHaveLength(506)
    report.mockResolvedValue(monthlyStorageReport())
    await sync("monthly")
    expect(await database.select().from(tables.amazonStorageFees)).toHaveLength(5)
    expect((await status("monthly")).windows[0]).toMatchObject({ complete: true, rows: 0 })
    expect((await status("aged")).windows[0]).toMatchObject({ complete: true, rows: 2 })
    expect(
      (await amazonStorageFeesStatus(otherId, "SELLER1", "monthly", now)).windows.every(
        (window) => window.rows === null
      )
    ).toBe(true)
  })
  it("preserves previous evidence on cancellation, malformed values and out-of-period rows", async () => {
    await sync("monthly")
    for (const response of [
      null,
      monthlyStorageReport([{ estimated_monthly_storage_fee: "bad" }]),
      monthlyStorageReport([{ month_of_charge: "2026-10" }])
    ]) {
      report.mockResolvedValue(response)
      await sync("monthly")
      expect(await database.select().from(tables.amazonStorageFees)).toHaveLength(2)
      expect((await status("monthly")).windows[0]).toMatchObject({
        complete: false,
        rows: 2,
        coveredTo: "2026-10-01T00:00:00.000Z",
        status: response === null ? "unavailable" : "failed"
      })
    }
    report.mockResolvedValue(agedStorageReport())
    await sync("aged")
    expect((await status("aged")).windows.every((window) => window.complete)).toBe(true)
  })
  it("rotates old corrections and exposes the next completed month as missing on rollover", async () => {
    await sync("monthly")
    await database
      .update(tables.amazonStorageFeeReports)
      .set({ checkedAt: new Date("2026-08-01") })
      .where(eq(tables.amazonStorageFeeReports.from, new Date("2026-05-01")))
    report.mockClear()
    await sync("monthly")
    expect(report).toHaveBeenCalledTimes(3)
    const future = await status("monthly", new Date("2026-11-01T00:00:00Z"))
    expect(future.windows[0]).toMatchObject({
      from: "2026-10-01T00:00:00.000Z",
      status: "not_imported",
      complete: false,
      rows: null
    })
  })
  it("rejects publication after a revision change or lost lease", async () => {
    report.mockImplementationOnce(async () => {
      await database.update(tables.salesSyncs).set({ revision: 2 }).where(eq(tables.salesSyncs.orgId, orgId))
      return monthlyStorageReport([{}])
    })
    await expect(sync("monthly")).rejects.toThrow("superseded")
    expect(await database.select().from(tables.amazonStorageFeeReports)).toEqual([])
    await database.update(tables.salesSyncs).set({ revision: 1 }).where(eq(tables.salesSyncs.orgId, orgId))
    owned.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Lease lost"))
    await expect(sync("monthly")).rejects.toThrow("Lease lost")
    expect(await database.select().from(tables.amazonStorageFees)).toEqual([])
  })
  it("resumes untouched history before retrying failures or refreshing covered months", async () => {
    report.mockResolvedValueOnce(monthlyStorageReport([{}]))
    report.mockRejectedValueOnce(new ProviderError(429, null, "throttled"))
    await sync("monthly")
    expect(report).toHaveBeenCalledTimes(2)
    report.mockClear()
    report.mockRejectedValueOnce(new ProviderError(429, null, "throttled"))
    await sync("monthly")
    expect(report.mock.calls[0]?.[0].dataStartTime).toBe("2026-07-01T00:00:00.000Z")
    expect((await status("monthly")).windows[0]).toMatchObject({ complete: true, rows: 1 })
    report.mockClear()
    report.mockResolvedValue(monthlyStorageReport())
    await sync("monthly")
    const starts = report.mock.calls.map(([request]) => request.dataStartTime.slice(0, 7))
    expect(starts.slice(0, 9)).toEqual([
      "2026-06",
      "2026-05",
      "2026-04",
      "2026-03",
      "2026-02",
      "2026-01",
      "2025-12",
      "2025-11",
      "2025-10"
    ])
    expect(starts.slice(9)).toEqual(["2026-08", "2026-07", "2026-09"])
  })
  it("records access denial once per source without claiming zero costs", async () => {
    report.mockRejectedValue(new ProviderError(403, null, "denied"))
    await sync("aged")
    expect(report).toHaveBeenCalledTimes(1)
    expect((await status("aged")).windows[0]).toMatchObject({
      complete: false,
      rows: null,
      errorCode: "report_access_denied"
    })
  })
})
