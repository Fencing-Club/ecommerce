import { randomUUID } from "node:crypto"
import { type Amazon, ProviderError } from "@repo/copacker-marketplaces/amazon"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { monthlyStorageReport, agedStorageReport } from "./fixtures/amazon-storage-fees"
import { database, setUpTestDatabase } from "./test-db"
vi.mock("@/db", () => import("./test-db"))
import { amazonMonthlyReports } from "../src/server/amazon-monthly-reports"
import { monthlyReportWindows } from "../src/server/amazon-report-sync"

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
const family = (kind: "monthly" | "aged") =>
  kind === "monthly" ? amazonMonthlyReports.monthlyStorageFees : amazonMonthlyReports.agedStorageFees
const sync = (kind: "monthly" | "aged", date = now) => family(kind).sync(input, owned, date)
const status = (kind: "monthly" | "aged", date = now) => family(kind).status(orgId, "SELLER1", date)
describe("Amazon storage acquisition", () => {
  it("retries recent unavailable months weekly and older months every thirty days", async () => {
    report.mockResolvedValue(null)
    await sync("aged")
    const setAge = async (days: number) => {
      await database
        .update(tables.amazonStorageFeeReports)
        .set({ checkedAt: new Date(now.getTime() - days * 86400000) })
      report.mockClear()
    }
    await setAge(6)
    await sync("aged")
    expect(report).not.toHaveBeenCalled()
    await setAge(7)
    await sync("aged")
    expect(report.mock.calls.map(([request]) => request.dataStartTime.slice(0, 7))).toEqual(["2026-09", "2026-08"])
    await setAge(29)
    await sync("aged")
    expect(report).toHaveBeenCalledTimes(2)
    await setAge(30)
    await sync("aged")
    expect(report).toHaveBeenCalledTimes(12)

    // In November, August ages out of the weekly tier; October is new history.
    await database.update(tables.amazonStorageFeeReports).set({ checkedAt: new Date("2026-10-24T00:00:00Z") })
    report.mockClear()
    await sync("aged", new Date("2026-11-01T00:00:00Z"))
    expect(report.mock.calls.map(([request]) => request.dataStartTime.slice(0, 7))).toEqual(["2026-10", "2026-09"])
  })
  it("backs off unavailable aged months and preserves them when a later refresh fails", async () => {
    report.mockResolvedValue(null)
    await sync("aged")
    expect(report).toHaveBeenCalledTimes(12)
    expect(report.mock.calls[0]?.[1].reuseCancelled).toBe(true)
    await database.update(tables.amazonStorageFeeReports).set({ checkedAt: now })
    report.mockClear()
    await sync("aged")
    expect(report).not.toHaveBeenCalled()
    expect(
      (await status("aged")).windows.every(
        (window) => window.status === "unavailable" && !window.complete && window.rows === null
      )
    ).toBe(true)

    await database.update(tables.amazonStorageFeeReports).set({ checkedAt: new Date(now.getTime() - 31 * 86400000) })
    report.mockRejectedValue(new ProviderError(429, null, "throttled"))
    await sync("aged")
    expect(report).toHaveBeenCalledTimes(1)
    expect((await status("aged")).windows[0]).toMatchObject({
      status: "unavailable",
      errorCode: "report_throttled",
      complete: false,
      rows: null
    })

    // A subsequent fresh document still replaces unavailable evidence normally.
    await database.update(tables.amazonStorageFeeReports).set({ checkedAt: new Date(now.getTime() - 31 * 86400000) })
    report.mockResolvedValue(agedStorageReport())
    await sync("aged")
    expect((await status("aged")).windows.every((window) => window.complete && window.rows === 0)).toBe(true)
  })
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
      (await family("monthly").status(otherId, "SELLER1", now)).windows.every((window) => window.rows === null)
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
    expect(report.mock.calls[0]?.[1].reuseCreatedSince).toBeDefined()
    expect(report.mock.calls.at(-1)?.[1].reuseCreatedSince).toBeUndefined()
  })
  it("rotates attempted missing months after throttling and logs no provider contents", async () => {
    await sync("monthly")
    await database.update(tables.amazonStorageFeeReports).set({
      status: "failed",
      coveredTo: null,
      checkedAt: new Date("2026-10-15")
    })
    await database
      .update(tables.amazonStorageFeeReports)
      .set({ checkedAt: new Date("2026-10-14") })
      .where(eq(tables.amazonStorageFeeReports.from, new Date("2026-02-01")))
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      report.mockClear()
      report.mockRejectedValueOnce(new ProviderError(429, null, "PRIVATE PROVIDER CONTENT"))
      await sync("monthly")
      expect(report.mock.calls[0]?.[0].dataStartTime).toBe("2026-02-01T00:00:00.000Z")
      expect(report).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE")
      report.mockClear()
      report.mockRejectedValueOnce(new ProviderError(429, null, "PRIVATE PROVIDER CONTENT"))
      await sync("monthly")
      expect(report.mock.calls[0]?.[0].dataStartTime).toBe("2026-09-01T00:00:00.000Z")
    } finally {
      log.mockRestore()
    }
  })
  it("logs only allowlisted validation fields without rejected financial values", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      report.mockResolvedValue(monthlyStorageReport([{ estimated_monthly_storage_fee: "PRIVATE VALUE" }]))
      await sync("monthly")
      expect(log).toHaveBeenCalledWith(
        "Amazon monthly report failed",
        expect.objectContaining({
          stage: "parse",
          validation: [{ code: "invalid_format", field: "amount" }]
        })
      )
      expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE")
    } finally {
      log.mockRestore()
    }
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
