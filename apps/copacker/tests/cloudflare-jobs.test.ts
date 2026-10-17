import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { applyMigrations } from "./migrations"

const context = vi.hoisted(() => ({ database: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.database }))
import { consumeJobSignal } from "../src/server/cloudflare-jobs"
import { runNextJob, nextJobDelay } from "../src/server/queue"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
beforeAll(async () => {
  context.database = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  await pg.exec("TRUNCATE jobs")
})
const eventJob = () => ({
  key: randomUUID(),
  kind: "ebay-event" as const,
  payload: { orgId: randomUUID(), userId: "disconnected-fixture" }
})

describe("Cloudflare background execution", () => {
  it("routes each job family to one deployed executor", async () => {
    await database.insert(tables.jobs).values(eventJob())
    expect(await runNextJob("railway")).toBe(false)
    expect(await nextJobDelay("railway")).toBeNull()
    expect(await runNextJob("cloudflare")).toBe(true)
    expect(await runNextJob("cloudflare")).toBe(false)
    const [job] = await database.select().from(tables.jobs)
    expect(job).toMatchObject({ status: "complete", attempts: 1 })
  })
  it("keeps unsupported jobs on Railway and runs every family locally", async () => {
    await database.insert(tables.jobs).values({ ...eventJob(), kind: "email" })
    expect(await runNextJob("cloudflare")).toBe(false)
    expect(await nextJobDelay("cloudflare")).toBeNull()
    await database.delete(tables.jobs)
    await database.insert(tables.jobs).values(eventJob())
    expect(await runNextJob("local")).toBe(true)
  })
  it("shares a three-job limit with retained Node work", async () => {
    await database.insert(tables.jobs).values(
      Array.from({ length: 3 }, () => ({
        ...eventJob(),
        kind: "import" as const,
        status: "running",
        leaseAt: new Date()
      }))
    )
    await database.insert(tables.jobs).values(eventJob())
    expect(await runNextJob("cloudflare")).toBe(false)
    expect(await database.select().from(tables.jobs).where(eq(tables.jobs.status, "pending"))).toHaveLength(1)
  })
  it("recovers an abandoned attempt and ignores a later duplicate delivery", async () => {
    await database
      .insert(tables.jobs)
      .values({ ...eventJob(), status: "running", leaseAt: new Date(Date.now() - 660000), attempts: 1 })
    expect(await runNextJob("cloudflare")).toBe(true)
    expect(await runNextJob("cloudflare")).toBe(false)
    expect((await database.select().from(tables.jobs))[0]).toMatchObject({ status: "complete", attempts: 2 })
  })
  it("does one attempt and republishes delayed work before acknowledging", async () => {
    const runNext = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
    const signal = vi.fn<(delay: number) => Promise<void>>().mockResolvedValue(undefined)
    await consumeJobSignal('{"kind":"wake"}', { runNext, nextDelay: async () => 42, signal })
    expect(runNext).toHaveBeenCalledOnce()
    expect(signal).toHaveBeenCalledWith(42)
    signal.mockRejectedValueOnce(new Error("queue unavailable"))
    await expect(consumeJobSignal({ kind: "wake" }, { runNext, nextDelay: async () => 1, signal })).rejects.toThrow(
      "queue unavailable"
    )
  })
  it("rejects invalid messages and leaves failed database work unacknowledged", async () => {
    const runNext = vi.fn<() => Promise<boolean>>(async () => {
      throw new Error("database unavailable")
    })
    const signal = vi.fn<(delay: number) => Promise<void>>().mockResolvedValue(undefined)
    const dependencies = { runNext, nextDelay: async () => null, signal }
    await expect(consumeJobSignal({ kind: "reconcile" }, dependencies)).rejects.toThrow("wake signals only")
    expect(runNext).not.toHaveBeenCalled()
    await expect(consumeJobSignal({ kind: "wake" }, dependencies)).rejects.toThrow("database unavailable")
    expect(signal).not.toHaveBeenCalled()
  })
})
