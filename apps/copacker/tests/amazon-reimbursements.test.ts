import { randomUUID } from "node:crypto"
import { Amazon, ProviderError } from "@repo/copacker-marketplaces/amazon"
import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { reimbursementReport } from "./fixtures/amazon-reimbursements"
import { database, setUpTestDatabase } from "./test-db"
vi.mock("@/db", () => import("./test-db"))
import { amazonMonthlyReports } from "../src/server/amazon-monthly-reports"

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
    reimbursementReport(
      request.dataStartTime.startsWith("2026-10")
        ? [
            {},
            {
              "quantity-reimbursed-cash": "0",
              "quantity-reimbursed-inventory": "2",
              "amount-total": "",
              "amount-per-unit": ""
            },
            {
              "reimbursement-id": "R2",
              reason: "Reimbursement_Reversal",
              "original-reimbursement-id": "R1",
              "original-reimbursement-type": "ORIGINAL",
              "quantity-reimbursed-cash": "-1",
              "quantity-reimbursed-total": "-1",
              "amount-total": "-3.123456"
            }
          ]
        : []
    )
  )
})

describe("Amazon reimbursement ingestion", () => {
  it("backfills cash, inventory and reversal evidence without affecting the financial ledger", async () => {
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    expect(report).toHaveBeenCalledTimes(13)
    expect(report.mock.calls[0]?.[0]).toMatchObject({
      reportType: "GET_FBA_REIMBURSEMENTS_DATA",
      marketplaceIds: ["ATVPDKIKX0DER"],
      dataStartTime: "2026-10-01T00:00:00.000Z",
      dataEndTime: "2026-10-15T23:59:59.000Z"
    })
    const rows = await database.select().from(tables.amazonReimbursements)
    expect(rows).toHaveLength(3)
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reimbursementId: "R1",
          amountTotal: "6.246912",
          quantityCash: 2,
          quantityInventory: 0
        }),
        expect.objectContaining({ reimbursementId: "R1", amountTotal: null, quantityCash: 0, quantityInventory: 2 }),
        expect.objectContaining({
          reimbursementId: "R2",
          amountTotal: "-3.123456",
          quantityCash: -1,
          originalReimbursementId: "R1"
        })
      ])
    )
    expect(await database.select().from(tables.amazonTransactions)).toEqual([])
    expect(
      (await amazonMonthlyReports.reimbursements.status(orgId, "SELLER1", now)).windows.every(
        (window) => window.complete
      )
    ).toBe(true)
    report.mockClear()
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    expect(report).toHaveBeenCalledTimes(2)
    expect(await database.select().from(tables.amazonReimbursements)).toHaveLength(3)
  })

  it("replaces corrections and removed rows while preserving unrelated account and workspace evidence", async () => {
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    await database.insert(tables.amazonReimbursements).values([
      {
        orgId: otherId,
        externalAccountId: "SELLER1",
        marketplaceId: "ATVPDKIKX0DER",
        approvedAt: new Date("2026-10-02"),
        reimbursementId: "other"
      },
      {
        orgId,
        externalAccountId: "SELLER2",
        marketplaceId: "ATVPDKIKX0DER",
        approvedAt: new Date("2026-10-02"),
        reimbursementId: "other"
      }
    ])
    report.mockImplementation(async (request) =>
      reimbursementReport(
        request.dataStartTime.startsWith("2026-10")
          ? [{ "amount-total": "9007199254740993.123456", "quantity-reimbursed-cash": "3" }]
          : []
      )
    )
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    const rows = await database.select().from(tables.amazonReimbursements)
    expect(rows).toHaveLength(3)
    expect(rows.find((row) => row.reimbursementId === "R1")?.amountTotal).toBe("9007199254740993.123456")
    report.mockResolvedValue(reimbursementReport())
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    expect((await database.select().from(tables.amazonReimbursements)).map((row) => row.reimbursementId)).toEqual([
      "other",
      "other"
    ])
    expect(
      (await amazonMonthlyReports.reimbursements.status(otherId, "SELLER1", now)).windows.every(
        (window) => window.rows === null
      )
    ).toBe(true)
  })

  it("retains prior data on failure and distinguishes unavailable months from verified zero", async () => {
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    report.mockImplementation(async (request) => (request.dataStartTime.startsWith("2026-10") ? null : "broken"))
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    expect(await database.select().from(tables.amazonReimbursements)).toHaveLength(3)
    const status = await amazonMonthlyReports.reimbursements.status(orgId, "SELLER1", now)
    expect(status.windows[0]).toMatchObject({
      status: "unavailable",
      complete: false,
      rows: 3,
      errorCode: "report_cancelled"
    })
    expect(status.windows[1]).toMatchObject({ status: "failed", complete: false, rows: 0 })
    report.mockResolvedValue(reimbursementReport())
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    expect((await amazonMonthlyReports.reimbursements.status(orgId, "SELLER1", now)).windows[0]).toMatchObject({
      status: "imported",
      complete: true,
      rows: 0,
      errorCode: null
    })
  })

  it("does not publish any part of a malformed month and continues older windows", async () => {
    report.mockImplementation(async (request) =>
      reimbursementReport(
        request.dataStartTime.startsWith("2026-10") ? [{}, { "quantity-reimbursed-cash": "bad" }] : []
      )
    )
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    expect(await database.select().from(tables.amazonReimbursements)).toEqual([])
    const status = await amazonMonthlyReports.reimbursements.status(orgId, "SELLER1", now)
    expect(status.windows[0]).toMatchObject({ status: "failed", coveredTo: null, rows: null })
    expect(status.windows.slice(1).every((window) => window.complete)).toBe(true)
  })

  it("aborts publication after disconnect, revision change or loss of the worker lease", async () => {
    report.mockImplementationOnce(async () => {
      await database.update(tables.salesSyncs).set({ revision: 2 }).where(eq(tables.salesSyncs.orgId, orgId))
      return reimbursementReport([{}])
    })
    await expect(amazonMonthlyReports.reimbursements.sync(input, owned, now)).rejects.toThrow("superseded")
    expect(await database.select().from(tables.amazonReimbursementReports)).toEqual([])
    await database.update(tables.salesSyncs).set({ revision: 1 }).where(eq(tables.salesSyncs.orgId, orgId))
    owned.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Lease lost"))
    await expect(amazonMonthlyReports.reimbursements.sync(input, owned, now)).rejects.toThrow("Lease lost")
    await database.delete(tables.connections).where(eq(tables.connections.orgId, orgId))
    report.mockClear()
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    expect(report).not.toHaveBeenCalled()
    expect(await database.select().from(tables.amazonReimbursements)).toEqual([])
  })

  it("rotates old successful months and marks a newer day incomplete until refreshed", async () => {
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    await database
      .update(tables.amazonReimbursementReports)
      .set({ checkedAt: new Date("2026-08-01") })
      .where(
        and(
          eq(tables.amazonReimbursementReports.orgId, orgId),
          eq(tables.amazonReimbursementReports.from, new Date("2026-05-01"))
        )
      )
    const tomorrow = new Date("2026-10-17T12:00:00Z")
    expect((await amazonMonthlyReports.reimbursements.status(orgId, "SELLER1", tomorrow)).windows[0]?.complete).toBe(
      false
    )
    report.mockClear()
    await amazonMonthlyReports.reimbursements.sync(input, owned, tomorrow)
    expect(report).toHaveBeenCalledTimes(3)
    expect((await amazonMonthlyReports.reimbursements.status(orgId, "SELLER1", tomorrow)).windows[0]?.complete).toBe(
      true
    )
  })

  it.each([403, 429])("stops issuing more requests after Amazon rejects access or throttles (%s)", async (status) => {
    report.mockRejectedValue(new ProviderError(status, null, "unavailable"))
    await amazonMonthlyReports.reimbursements.sync(input, owned, now)
    expect(report).toHaveBeenCalledTimes(1)
    const state = await amazonMonthlyReports.reimbursements.status(orgId, "SELLER1", now)
    expect(state.windows[0]).toMatchObject({
      status: "failed",
      rows: null,
      errorCode: status === 403 ? "report_access_denied" : "report_throttled"
    })
    expect(state.windows[1]?.status).toBe("not_imported")
  })
})

it("recovers a failed repeat refresh using exact recent daily reports without creating duplicates", async () => {
  await amazonMonthlyReports.reimbursements.sync(input, owned, now)
  await database
    .update(tables.amazonReimbursementReports)
    .set({ status: "failed", errorCode: "report_failed" })
    .where(eq(tables.amazonReimbursementReports.from, new Date("2026-10-01")))
  const calls: Array<{ method: string; url: URL }> = []
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    const parsed = new URL(String(url))
    if (parsed.hostname === "api.amazon.com") {
      return Response.json({ access_token: "test", expires_in: 3600 })
    }
    calls.push({ method: init?.method ?? "GET", url: parsed })
    if (parsed.hostname === "reports.example") {
      return new Response(reimbursementReport(parsed.pathname === "/doc-oct" ? [{}] : []))
    }
    if (parsed.pathname === "/reports/2021-06-30/reports" && init?.method === "GET") {
      return Response.json({
        reports: [
          {
            reportId: "oct",
            reportType: "GET_FBA_REIMBURSEMENTS_DATA",
            marketplaceIds: ["ATVPDKIKX0DER"],
            processingStatus: "DONE",
            reportDocumentId: "doc-oct",
            createdTime: "2026-10-16T10:00:00Z",
            dataStartTime: "2026-10-01T00:00:00Z",
            dataEndTime: "2026-10-15T23:59:59Z"
          },
          {
            reportId: "sep",
            reportType: "GET_FBA_REIMBURSEMENTS_DATA",
            marketplaceIds: ["ATVPDKIKX0DER"],
            processingStatus: "DONE",
            reportDocumentId: "doc-sep",
            createdTime: "2026-10-16T10:00:00Z",
            dataStartTime: "2026-09-01T00:00:00Z",
            dataEndTime: "2026-09-30T23:59:59Z"
          }
        ]
      })
    }
    if (/^\/reports\/2021-06-30\/reports\/(oct|sep)$/.test(parsed.pathname)) {
      return Response.json({ processingStatus: "DONE", reportDocumentId: `doc-${parsed.pathname.split("/").at(-1)}` })
    }
    if (/^\/reports\/2021-06-30\/documents\/doc-(oct|sep)$/.test(parsed.pathname)) {
      return Response.json({ url: `https://reports.example/${parsed.pathname.split("/").at(-1)}` })
    }
    throw new Error("Unexpected provider request")
  })
  const amazon = new Amazon({ clientId: "test", clientSecret: "test", refreshToken: "test" }, transport)
  await amazonMonthlyReports.reimbursements.sync({ ...input, amazon }, owned, now)
  expect(calls.every((call) => call.method === "GET")).toBe(true)
  expect(calls[0]?.url.searchParams.get("createdSince")).toBe("2026-10-16T08:00:00.000Z")
  expect(
    (await amazonMonthlyReports.reimbursements.status(orgId, "SELLER1", now)).windows.every((window) => window.complete)
  ).toBe(true)
  expect(await database.select().from(tables.amazonReimbursements)).toHaveLength(1)
  expect(await database.select().from(tables.amazonTransactions)).toEqual([])
})
