import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import * as schema from "../src/db/schema"
import { applyMigrations } from "./migrations"
const context = vi.hoisted(() => ({ database: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.database }))
import {
  amazonReportPolicy,
  observeAmazonReportRequest,
  reserveAmazonReportRequest
} from "../src/server/amazon-report-policy"
const pg = new PGlite()
const database = drizzle(pg, { schema })
const now = new Date("2026-10-19T01:00:00Z")
const response = { reportType: "AGED", status: 429, rateLimit: null, retryAfterMs: null, requestId: "request-id" }
beforeAll(async () => {
  context.database = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  await pg.exec("TRUNCATE amazon_report_quotas")
  vi.restoreAllMocks()
})

it("shares one creation allowance across report types and concurrent callers, but isolates sellers", async () => {
  const results = await Promise.all([
    reserveAmazonReportRequest("seller-a", "AGED", now),
    reserveAmazonReportRequest("seller-a", "REMOVALS", now)
  ])
  expect(results.filter((result) => result === null)).toHaveLength(1)
  expect(results.find((result) => result !== null)?.toISOString()).toBe("2026-10-19T01:02:00.000Z")
  expect(await reserveAmazonReportRequest("seller-b", "AGED", now)).toBeNull()
  expect(await reserveAmazonReportRequest("seller-a", "REMOVALS", new Date("2026-10-19T01:02:00Z"))).toBeNull()
})

it("persists per-type cooldowns across clients without blocking unrelated types for the whole hour", async () => {
  await observeAmazonReportRequest("seller", response, now)
  expect(await reserveAmazonReportRequest("seller", "AGED", new Date("2026-10-19T01:10:00Z"))).toEqual(
    new Date("2026-10-19T02:00:00Z")
  )
  expect(await reserveAmazonReportRequest("seller", "REMOVALS", new Date("2026-10-19T01:10:00Z"))).toBeNull()
  await observeAmazonReportRequest("seller", response, new Date("2026-10-19T02:00:00Z"))
  expect(await reserveAmazonReportRequest("seller", "AGED", new Date("2026-10-19T02:10:00Z"))).toEqual(
    new Date("2026-10-19T04:00:00Z")
  )
  await observeAmazonReportRequest("seller", { ...response, status: 202 }, new Date("2026-10-19T04:00:00Z"))
  await observeAmazonReportRequest("seller", response, new Date("2026-10-19T04:10:00Z"))
  expect(await reserveAmazonReportRequest("seller", "AGED", new Date("2026-10-19T04:20:00Z"))).toEqual(
    new Date("2026-10-19T05:10:00Z")
  )
})

it("honors slower advertised rates and longer Retry-After values", async () => {
  await observeAmazonReportRequest("seller", { ...response, status: 202, rateLimit: 0.002 }, now)
  expect(await reserveAmazonReportRequest("seller", "REMOVALS", now)).toEqual(new Date(now.getTime() + 500000))
  await observeAmazonReportRequest("seller", { ...response, retryAfterMs: 7200000 }, now)
  expect(await reserveAmazonReportRequest("seller", "AGED", now)).toEqual(new Date(now.getTime() + 7200000))
  expect(await reserveAmazonReportRequest("seller", "REMOVALS", now)).toEqual(new Date(now.getTime() + 7200000))
})

it("coordinates reconstructed policies and rejects a wait beyond the caller deadline", async () => {
  const first = amazonReportPolicy("seller", "app")
  const second = amazonReportPolicy("seller", "app")
  const active = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  await first.acquire({ reportType: "AGED", deadline: Date.now() + 10000, assertActive: active })
  await expect(
    second.acquire({ reportType: "REMOVALS", deadline: Date.now() + 10000, assertActive: active })
  ).rejects.toThrow("waiting for its request allowance")
  await amazonReportPolicy("seller", "another-app").acquire({ reportType: "AGED", deadline: Date.now() + 10000 })
  expect(active).toHaveBeenCalledTimes(2)
})

it("never logs arbitrary provider identifiers or report names", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
  await observeAmazonReportRequest(
    "hashed-scope",
    { ...response, reportType: "private value", requestId: "private@example.com" },
    now
  )
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|example/)
  expect(log).toHaveBeenCalledWith(expect.stringContaining('"status":429'))
})

it("rechecks ownership after waiting and does not consume another slot after cancellation", async () => {
  const policy = amazonReportPolicy("seller", "app")
  await policy.acquire({ reportType: "AGED", deadline: Date.now() + 10000 })
  const next = new Date(Date.now() + 500)
  await database
    .update(schema.amazonReportQuotas)
    .set({ nextRequestAt: next })
    .where(eq(schema.amazonReportQuotas.reportType, ""))
  const active = vi
    .fn<() => Promise<void>>()
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new Error("Ownership changed"))
  await expect(
    policy.acquire({ reportType: "AGED", deadline: Date.now() + 10000, assertActive: active })
  ).rejects.toThrow("Ownership changed")
  expect(active).toHaveBeenCalledTimes(2)
  expect(
    (await database.select().from(schema.amazonReportQuotas).where(eq(schema.amazonReportQuotas.reportType, "")))[0]
      ?.nextRequestAt
  ).toEqual(next)
})
