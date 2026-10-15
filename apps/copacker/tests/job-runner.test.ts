import { describe, expect, it, vi } from "vitest"
import scheduler from "../scheduler/index"
import { drainPendingJobs } from "../src/server/job-runner"

describe("signal-driven jobs", () => {
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
