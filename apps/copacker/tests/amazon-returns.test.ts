import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Amazon } from "@repo/aisle/amazon"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { applySchema } from "./database"
const context = vi.hoisted(() => ({ database: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.database }))
import { monthlyReportWindows } from "../src/server/amazon-report-sync"
import { amazonReturnsStatus, syncAmazonReturns } from "../src/server/amazon-returns"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const orgId = randomUUID(),
  otherId = randomUUID()
const now = new Date("2026-10-16T12:00:00Z")
const header =
  "return-date\torder-id\tsku\tasin\tfnsku\tquantity\tfulfillment-center-id\tdetailed-disposition\treason\tstatus\tlicense-plate-number"
const row = "2026-10-02T00:00:00Z\tORDER1\tSKU1\tA1\tF1\t1\tFC1\tSELLABLE\tUNWANTED\tRETURNED\t"
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
    request.dataStartTime.startsWith("2026-10") ? `${header}\n${row}\n${row}` : header
  )
})

describe("Amazon returns ingestion", () => {
  it("backfills twelve completed months and the current partial month, then refreshes without multiplying rows", async () => {
    await syncAmazonReturns(input, owned, now)
    expect(report).toHaveBeenCalledTimes(13)
    expect(await database.select().from(tables.amazonReturns)).toHaveLength(2)
    const windows = await database.select().from(tables.amazonReturnReports)
    expect(windows).toHaveLength(13)
    expect(windows.every((window) => window.status === "imported" && window.coveredTo)).toBe(true)
    report.mockClear()
    await syncAmazonReturns(input, owned, now)
    expect(report).toHaveBeenCalledTimes(2)
    expect(await database.select().from(tables.amazonReturns)).toHaveLength(2)
    report.mockImplementation(async (request) =>
      request.dataStartTime.startsWith("2026-10") ? `${header}\n${row.replace("SELLABLE", "CUSTOMER_DAMAGED")}` : header
    )
    await syncAmazonReturns(input, owned, now)
    expect(await database.select().from(tables.amazonReturns)).toMatchObject([
      { quantity: 1, disposition: "CUSTOMER_DAMAGED" }
    ])
    report.mockResolvedValue(header)
    await syncAmazonReturns(input, owned, now)
    expect(await database.select().from(tables.amazonReturns)).toEqual([])
  })

  it("keeps previous data on cancellation or malformed reports and continues other months", async () => {
    await syncAmazonReturns(input, owned, now)
    report.mockImplementation(async (request) => (request.dataStartTime.startsWith("2026-10") ? null : "broken"))
    await syncAmazonReturns(input, owned, now)
    expect(await database.select().from(tables.amazonReturns)).toHaveLength(2)
    const windows = await database.select().from(tables.amazonReturnReports)
    expect(
      windows.find((window) => window.from.getUTCMonth() === 9 && window.from.getUTCFullYear() === 2026)
    ).toMatchObject({
      status: "unavailable",
      errorCode: "report_cancelled",
      rowCount: 2,
      coveredTo: new Date("2026-10-16T00:00:00Z")
    })
    expect(windows.find((window) => window.from.getUTCMonth() === 8)).toMatchObject({ status: "failed", rowCount: 0 })
  })

  it("does not count missing, failed or out-of-window reports as empty months", async () => {
    report.mockImplementation(async (request) => {
      if (request.dataStartTime.startsWith("2026-10")) {
        return null
      }
      if (request.dataStartTime.startsWith("2026-09")) {
        throw new Error("Provider unavailable")
      }
      return `${header}\n${row}`
    })
    await syncAmazonReturns(input, owned, now)
    expect(report).toHaveBeenCalledTimes(13)
    expect(await database.select().from(tables.amazonReturns)).toEqual([])
    expect(
      (await database.select().from(tables.amazonReturnReports)).every(
        (window) => window.coveredTo === null && window.rowCount === null
      )
    ).toBe(true)
  })

  it("refuses publication after account replacement or loss of the worker lease", async () => {
    report.mockImplementationOnce(async () => {
      await database
        .update(tables.connections)
        .set({ externalId: "SELLER2" })
        .where(eq(tables.connections.orgId, orgId))
      return `${header}\n${row}`
    })
    await expect(syncAmazonReturns(input, owned, now)).rejects.toThrow("superseded")
    expect(await database.select().from(tables.amazonReturnReports)).toEqual([])
    await database.update(tables.connections).set({ externalId: "SELLER1" }).where(eq(tables.connections.orgId, orgId))
    owned.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Lease lost"))
    await expect(syncAmazonReturns(input, owned, now)).rejects.toThrow("Lease lost")
    expect(await database.select().from(tables.amazonReturns)).toEqual([])
  })

  it("isolates coverage by workspace and seller and stops superseded work before requesting reports", async () => {
    await syncAmazonReturns(input, owned, now)
    const status = await amazonReturnsStatus(otherId, "SELLER1")
    expect(status.windows.every((window) => window.status === "not_imported" && window.rows === null)).toBe(true)
    expect((await amazonReturnsStatus(orgId, "SELLER2")).windows.every((window) => window.rows === null)).toBe(true)
    report.mockClear()
    await syncAmazonReturns({ ...input, revision: 2 }, owned, now)
    expect(report).not.toHaveBeenCalled()
  })

  it("revisits older successful months for corrections", async () => {
    await syncAmazonReturns(input, owned, now)
    await database
      .update(tables.amazonReturnReports)
      .set({ checkedAt: new Date("2026-08-01") })
      .where(eq(tables.amazonReturnReports.from, new Date("2026-05-01")))
    report.mockClear()
    await syncAmazonReturns(input, owned, now)
    expect(report).toHaveBeenCalledTimes(3)
  })

  it("handles month and year boundaries with exclusive UTC ends", () => {
    const windows = monthlyReportWindows(new Date("2026-01-01T12:00:00Z"))
    expect(windows).toHaveLength(12)
    expect(windows[0]).toEqual({ from: new Date("2025-12-01"), to: new Date("2026-01-01") })
    expect(windows.at(-1)?.from).toEqual(new Date("2025-01-01"))
  })

  it("exposes incomplete coverage after the day advances and recovers cancelled months", async () => {
    report.mockImplementation(async (request) => (request.dataStartTime.startsWith("2026-09") ? null : header))
    await syncAmazonReturns(input, owned, now)
    const before = await amazonReturnsStatus(orgId, "SELLER1", now)
    expect(before.windows[0]).toMatchObject({ complete: true, rows: 0 })
    expect(before.windows[1]).toMatchObject({ complete: false, status: "unavailable", rows: null })
    const tomorrow = new Date("2026-10-17T12:00:00Z")
    expect((await amazonReturnsStatus(orgId, "SELLER1", tomorrow)).windows[0]?.complete).toBe(false)
    report.mockResolvedValue(header)
    await syncAmazonReturns(input, owned, tomorrow)
    expect((await amazonReturnsStatus(orgId, "SELLER1", tomorrow)).windows.every((window) => window.complete)).toBe(
      true
    )
  })

  it("preserves other sellers and workspaces when replacing a month", async () => {
    const other = {
      marketplaceId: "ATVPDKIKX0DER",
      returnedAt: new Date("2026-10-02"),
      orderId: "ORDER1",
      sku: "SKU1",
      quantity: 7
    }
    await database.insert(tables.amazonReturns).values([
      { ...other, orgId: otherId, externalAccountId: "SELLER1" },
      { ...other, orgId, externalAccountId: "SELLER2" }
    ])
    await syncAmazonReturns(input, owned, now)
    report.mockResolvedValue(header)
    await syncAmazonReturns(input, owned, now)
    const remaining = await database.select().from(tables.amazonReturns)
    expect(remaining).toHaveLength(2)
    expect(remaining.every((row) => row.quantity === 7)).toBe(true)
  })
})
