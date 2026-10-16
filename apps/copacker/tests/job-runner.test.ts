import { describe, expect, it, vi } from "vitest"
import scheduler from "../scheduler/index"
import { drainPendingJobs, jobConcurrency, limitJobConcurrency } from "../src/server/job-runner"

describe("signal-driven jobs", () => {
  it("uses free slots for a new signal while an earlier batch has a long-running job", async () => {
    const longJob = Promise.withResolvers<boolean>()
    const shortJob = vi.fn<() => Promise<boolean>>().mockResolvedValue(false)
    const runNext = limitJobConcurrency(
      vi.fn<() => Promise<boolean>>().mockReturnValueOnce(longJob.promise).mockImplementation(shortJob)
    )
    const options = { runNext, signal: async () => undefined, nextDelay: async () => null, stopped: () => false }
    const first = drainPendingJobs(options)
    await vi.waitFor(() => expect(shortJob).toHaveBeenCalledTimes(2))
    // The second signal finishes without waiting for the first batch's slow handler.
    await drainPendingJobs(options)
    expect(shortJob).toHaveBeenCalledTimes(5)
    longJob.resolve(false)
    await first
  })
  it("bounds shared execution across signal readers and releases slots after errors", async () => {
    const pending: ReturnType<typeof Promise.withResolvers<boolean>>[] = []
    let active = 0
    let peak = 0
    const runNext = limitJobConcurrency(async () => {
      active++
      peak = Math.max(peak, active)
      const task = Promise.withResolvers<boolean>()
      pending.push(task)
      try {
        return await task.promise
      } finally {
        active--
      }
    })
    const work = Promise.allSettled(Array.from({ length: 9 }, runNext))
    expect(pending).toHaveLength(jobConcurrency)
    pending[0]!.reject(new Error("database unavailable"))
    await vi.waitFor(() => expect(pending).toHaveLength(4))
    for (let index = 1; index < 9; index++) {
      await vi.waitFor(() => expect(pending.length).toBeGreaterThan(index))
      pending[index]!.resolve(false)
    }
    const results = await work
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
    expect(peak).toBe(jobConcurrency)
    expect(active).toBe(0)
  })
  it("finishes an empty queue without scheduling another database check", async () => {
    const runNext = vi.fn<() => Promise<boolean>>().mockResolvedValue(false)
    const signal = vi.fn<(delay: number) => Promise<void>>()
    await drainPendingJobs({ runNext, signal, nextDelay: async () => null, stopped: () => false })
    expect(runNext).toHaveBeenCalledTimes(3)
    expect(signal).not.toHaveBeenCalled()
  })
  it("drains jobs then schedules the next due retry", async () => {
    const runNext = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false)
    const signal = vi.fn<(delay: number) => Promise<void>>()
    await drainPendingJobs({ runNext, signal, nextDelay: async () => 123, stopped: () => false })
    expect(runNext).toHaveBeenCalledTimes(5)
    expect(signal).toHaveBeenCalledWith(123)
  })
  it("propagates processing and scheduling failures so the message stays unacknowledged", async () => {
    const options = {
      runNext: async () => false,
      signal: vi.fn<(delay: number) => Promise<void>>(),
      nextDelay: async () => null,
      stopped: () => false
    }
    await expect(
      drainPendingJobs({
        ...options,
        runNext: async () => {
          throw new Error("database")
        }
      })
    ).rejects.toThrow("database")
    await expect(
      drainPendingJobs({
        ...options,
        nextDelay: async () => 20,
        signal: async () => {
          throw new Error("delivery")
        }
      })
    ).rejects.toThrow("delivery")
  })
  it("stops claiming new work on shutdown", async () => {
    const runNext = vi.fn<() => Promise<boolean>>()
    await drainPendingJobs({
      runNext,
      signal: vi.fn<(delay: number) => Promise<void>>(),
      nextDelay: async () => null,
      stopped: () => true
    })
    expect(runNext).not.toHaveBeenCalled()
  })
  it("publishes recovery and daily reconciliation signals without a database connection", async () => {
    const send = vi.fn<(body: string, options: { contentType: string }) => Promise<void>>()
    await scheduler.scheduled({ cron: "17 * * * *" }, { JOBS: { send } })
    await scheduler.scheduled({ cron: "0 7 * * *" }, { JOBS: { send } })
    expect(send.mock.calls).toEqual([
      [JSON.stringify({ kind: "wake" }), { contentType: "text" }],
      [JSON.stringify({ kind: "reconcile" }), { contentType: "text" }]
    ])
  })
})
