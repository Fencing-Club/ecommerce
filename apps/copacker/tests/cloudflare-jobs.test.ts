import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import * as tables from "../src/db/schema"
import { database, setUpTestDatabase } from "./test-db"

vi.mock("@/db", () => import("./test-db"))
const readNotifications = vi.hoisted(() => vi.fn<(provider: string) => Promise<number>>())
vi.mock("../src/server/notification-reader", () => ({ readNotifications }))
import { consumeJobSignals } from "../src/server/cloudflare-jobs"
import { runNextJob, runClaimedJob, type JobClaim } from "../src/server/queue"

setUpTestDatabase({ truncate: [tables.jobs] })
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
        status: "running" as const,
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
})

// The executor queue's deliveries: each message logs when it's acknowledged, after the signals the handler publishes.
function executor(...bodies: unknown[]) {
  const log: string[] = []
  const messages = bodies.map((body, index) => ({ body, ack: () => log.push(`ack ${index}`) }))
  const queue = {
    send: vi.fn<(body: string, options: { contentType: "text"; delaySeconds: number }) => Promise<void>>(
      async (body, options) => {
        log.push(`${body} in ${options.delaySeconds}s`)
      }
    )
  }
  const workflow = {
    create: vi.fn<(options: { id: string; params: JobClaim }) => Promise<unknown>>(async () => undefined),
    get: vi.fn<(id: string) => Promise<{ status: () => Promise<unknown> }>>()
  }
  return { log, messages, queue, workflow }
}

describe("Cloudflare executor queue", () => {
  afterEach(() => vi.useRealTimers())

  it("runs one job per wake, then wakes the executor for the next due job before acknowledging", async () => {
    vi.useFakeTimers({ now: Date.now(), toFake: ["Date"] })
    await database.insert(tables.jobs).values([
      { ...eventJob(), runAt: new Date(Date.now() - 1000) },
      { ...eventJob(), runAt: new Date(Date.now() + 42000) }
    ])
    const { log, messages, queue, workflow } = executor('{"kind":"wake"}')
    await consumeJobSignals(messages, { queue, workflow })
    expect(log).toEqual(['{"kind":"wake"} in 42s', "ack 0"])
    expect(await database.select().from(tables.jobs).where(eq(tables.jobs.status, "complete"))).toHaveLength(1)
    expect(workflow.create).not.toHaveBeenCalled()
  })

  it("starts a long job's Workflow, and queues the day's reconciliation on its signal", async () => {
    await database.insert(tables.jobs).values({ ...eventJob(), kind: "email", runAt: new Date(Date.now() - 1000) })
    const { log, messages, queue, workflow } = executor({ kind: "reconcile" })
    await consumeJobSignals(messages, { queue, workflow })
    const claim = workflow.create.mock.calls[0]![0].params
    expect(workflow.create).toHaveBeenCalledWith({ id: `${claim.id}-${Date.parse(claim.leaseAt)}`, params: claim })
    expect((await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "reconcile"))).length).toBe(1)
    expect(queue.send).toHaveBeenCalledOnce()
    expect(log.at(-1)).toBe("ack 0")
  })

  it("treats a Workflow that exists as started when its create answer was lost", async () => {
    await database.insert(tables.jobs).values({ ...eventJob(), kind: "email", runAt: new Date(Date.now() - 1000) })
    const { log, messages, queue, workflow } = executor('{"kind":"wake"}')
    workflow.create.mockRejectedValue(new Error("timeout"))
    workflow.get.mockResolvedValue({ status: async () => ({ status: "running" }) })
    await consumeJobSignals(messages, { queue, workflow })
    expect(workflow.get).toHaveBeenCalledWith(workflow.create.mock.calls[0]![0].id)
    expect(log.at(-1)).toBe("ack 0")
  })

  it("reads one batch of a provider's notifications, and reads again a second later when it was full", async () => {
    const { log, messages, queue } = executor(
      '{"kind":"notifications","provider":"shopify"}',
      '{"kind":"notifications","provider":"amazon"}'
    )
    readNotifications.mockResolvedValueOnce(10).mockResolvedValueOnce(3)
    await consumeJobSignals(messages, { queue })
    expect(readNotifications.mock.calls).toEqual([["shopify"], ["amazon"]])
    expect(log).toEqual(['{"kind":"notifications","provider":"shopify"} in 1s', "ack 0", "ack 1"])
  })

  it("leaves a message unacknowledged when it's unreadable, its work fails or its next signal can't be sent", async () => {
    for (const [body, error] of [
      ['{"kind":"sleep"}', z.ZodError],
      ["not json", SyntaxError]
    ] as const) {
      const { log, messages, queue } = executor(body)
      await expect(consumeJobSignals(messages, { queue })).rejects.toThrow(error)
      expect(log).toEqual([])
    }
    await database.insert(tables.jobs).values({ ...eventJob(), kind: "email", runAt: new Date(Date.now() - 1000) })
    const missing = executor('{"kind":"wake"}')
    await expect(consumeJobSignals(missing.messages, { queue: missing.queue })).rejects.toThrow(
      "Job Workflow binding is missing"
    )
    expect(missing.log).toEqual([])
    const lost = executor('{"kind":"wake"}')
    lost.workflow.create.mockRejectedValue(new Error("timeout"))
    lost.workflow.get.mockRejectedValue(new Error("instance not found"))
    await database.update(tables.jobs).set({ status: "pending", leaseAt: null })
    await expect(consumeJobSignals(lost.messages, lost)).rejects.toThrow("timeout")
    expect(lost.log).toEqual([])
    const unsent = executor('{"kind":"wake"}')
    unsent.queue.send.mockRejectedValue(new Error("queue unavailable"))
    await expect(consumeJobSignals(unsent.messages, unsent)).rejects.toThrow("queue unavailable")
    expect(unsent.log).toEqual([])
  })
})
