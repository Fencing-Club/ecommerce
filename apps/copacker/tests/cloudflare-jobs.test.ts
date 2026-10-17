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
import { runNextJob, runClaimedJob, type JobClaim } from "../src/server/queue"

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
  it("executes bounded jobs without starting a Workflow", async () => {
    const dispatch = vi.fn<(claim: JobClaim) => Promise<void>>().mockResolvedValue()
    await database.insert(tables.jobs).values(eventJob())
    expect(await runNextJob("cloudflare", dispatch)).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
    expect((await database.select().from(tables.jobs))[0]).toMatchObject({ status: "complete", attempts: 1 })
  })
  it("dispatches long jobs and rejects stale claims before executing", async () => {
    const dispatch = vi.fn<(claim: JobClaim) => Promise<void>>().mockResolvedValue()
    await database.insert(tables.jobs).values({ ...eventJob(), kind: "email" })
    expect(await runNextJob("cloudflare", dispatch)).toBe(true)
    const claim = dispatch.mock.calls[0]![0]
    await runClaimedJob({ ...claim, leaseAt: new Date(0).toISOString() })
    expect((await database.select().from(tables.jobs))[0]?.status).toBe("running")
    // Invalid email payload fails in the Workflow, proving the claim reaches its handler.
    await runClaimedJob(claim)
    expect((await database.select().from(tables.jobs))[0]?.status).toBe("failed")
    await runClaimedJob(claim)
    expect((await database.select().from(tables.jobs))[0]?.attempts).toBe(1)
  })
  it("preserves an ambiguous dispatch lease until recovery", async () => {
    await database.insert(tables.jobs).values({ ...eventJob(), kind: "email" })
    const dispatch = vi.fn<(claim: JobClaim) => Promise<void>>().mockRejectedValue(new Error("timeout"))
    await expect(runNextJob("cloudflare", dispatch)).rejects.toThrow("timeout")
    expect(await runNextJob("cloudflare", dispatch)).toBe(false)
    await database.update(tables.jobs).set({ leaseAt: new Date(Date.now() - 660000) })
    dispatch.mockResolvedValue()
    expect(await runNextJob("cloudflare", dispatch)).toBe(true)
    expect(dispatch.mock.calls[1]![0].attempt).toBe(2)
  })
  it("shares a three-job limit across Queues and Workflows", async () => {
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
