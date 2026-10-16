import { afterEach, describe, expect, it, vi } from "vitest"
import {
  acknowledgeJobSignal,
  receiveJobSignals,
  signalJobs,
  withJobPublisher,
  withJobWake
} from "../src/server/job-delivery"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
function setup(result: unknown = {}) {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32))
  vi.stubEnv("CLOUDFLARE_JOBS_QUEUE_ID", "b".repeat(32))
  vi.stubEnv("CLOUDFLARE_JOBS_TOKEN", "secret")
  const fetcher = vi
    .fn<(url: string, options: { body: string }) => Promise<Response>>()
    .mockImplementation(async () => Response.json({ success: true, result }))
  vi.stubGlobal("fetch", fetcher)
  return fetcher
}

describe("Cloudflare job delivery", () => {
  it("uses the invocation's binding without HTTP credentials", async () => {
    const fetcher = setup()
    vi.stubEnv("CLOUDFLARE_JOBS_QUEUE_ID", "")
    vi.stubEnv("CLOUDFLARE_JOBS_TOKEN", "")
    const publish = vi.fn<(delay: number) => Promise<void>>().mockResolvedValue()
    expect(await withJobPublisher(publish, () => withJobWake(Promise.resolve("saved")))).toBe("saved")
    await withJobPublisher(publish, () => signalJobs(1.2))
    expect(publish.mock.calls).toEqual([[0], [2]])
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("isolates publishers between overlapping invocations and restores the Node transport", async () => {
    const fetcher = setup()
    const first = vi.fn<(delay: number) => Promise<void>>().mockResolvedValue()
    const second = vi.fn<(delay: number) => Promise<void>>().mockResolvedValue()
    const { promise: pending, resolve: release } = Promise.withResolvers<void>()
    const invocation = withJobPublisher(first, async () => {
      await pending
      await signalJobs(3)
    })
    await withJobPublisher(second, () => signalJobs(4))
    release()
    await invocation
    expect(first.mock.calls).toEqual([[3]])
    expect(second.mock.calls).toEqual([[4]])
    await signalJobs()
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it("publishes only after commit and preserves the transaction result", async () => {
    const fetcher = setup()
    let commit: (value: number) => void = () => undefined
    const transaction = new Promise<number>((resolve) => {
      commit = resolve
    })
    const work = withJobWake(transaction)
    expect(fetcher).not.toHaveBeenCalled()
    commit(42)
    expect(await work).toBe(42)
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it("does not publish rolled back work", async () => {
    const fetcher = setup()
    await expect(withJobWake(Promise.reject(new Error("rollback")))).rejects.toThrow("rollback")
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("does not turn a committed action into a failure when delivery is unavailable", async () => {
    setup().mockRejectedValue(new Error("offline"))
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(await withJobWake(Promise.resolve("saved"))).toBe("saved")
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("job_signal_failed"))
  })
  it("rounds retry delays up and caps them to Cloudflare's maximum", async () => {
    const fetcher = setup()
    await signalJobs(1.2)
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).delay_seconds).toBe(2)
    await signalJobs(90000)
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).delay_seconds).toBe(86400)
  })
  it("pulls one signal and acknowledges its lease", async () => {
    const fetcher = setup({ messages: [{ lease_id: "lease", body: { kind: "wake" } }] })
    expect(await receiveJobSignals()).toEqual([{ lease_id: "lease", body: { kind: "wake" } }])
    await acknowledgeJobSignal("lease")
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ acks: [{ lease_id: "lease" }], retries: [] })
  })
  it("rejects a failed API envelope even with an HTTP success response", async () => {
    setup().mockResolvedValue(Response.json({ success: false }))
    await expect(signalJobs()).rejects.toThrow(/success/)
  })
  it("does not require hosted resources for local development", async () => {
    const fetcher = setup()
    vi.stubEnv("CLOUDFLARE_JOBS_QUEUE_ID", "")
    await withJobWake(Promise.resolve())
    expect(fetcher).not.toHaveBeenCalled()
  })
})
