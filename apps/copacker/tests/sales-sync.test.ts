import { ProviderError } from "@repo/aisle/amazon"
import { describe, expect, it, vi } from "vitest"
import { salesDataVersion, syncChunks, throttled } from "../src/server/sales-orders"
import { ledgerChunks } from "../src/server/stock-days"

const day = 86400000

describe("order and stock history syncs", () => {
  it("waits and retries a throttled read, but not other failures", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
    const owned = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ProviderError(429, null, "throttled", 90000))
      .mockRejectedValueOnce(new ProviderError(503, null, "busy"))
      .mockResolvedValueOnce("orders")
    expect(await throttled(read, owned, sleep)).toBe("orders")
    expect(sleep.mock.calls).toEqual([[90000], [120000]])
    expect(owned).toHaveBeenCalledTimes(2)
    await expect(
      throttled(async () => Promise.reject(new ProviderError(403, null, "denied")), owned, sleep)
    ).rejects.toThrow("denied")
    const always = vi.fn<() => Promise<string>>().mockRejectedValue(new ProviderError(429, null, "throttled"))
    await expect(throttled(always, owned, sleep)).rejects.toThrow("throttled")
    expect(always).toHaveBeenCalledTimes(5)
  })
  it("reads orders stored in an older shape again, newest first", () => {
    const now = Date.parse("2026-09-25T12:00:00Z")
    const coverage = { coveredFrom: new Date(now - 365 * day), coveredTo: new Date(now - day) }
    expect(syncChunks(now, { ...coverage, dataVersion: 0 }).fresh).toBe(true)
    expect(syncChunks(now, { ...coverage, dataVersion: salesDataVersion }).fresh).toBe(false)
  })
  it("starts over from the newest orders when the stored range stopped over a month ago", () => {
    const now = Date.parse("2026-09-25T12:00:00Z")
    const stale = syncChunks(now, { coveredFrom: new Date(now - 365 * day), coveredTo: new Date(now - 300 * day) })
    expect(stale.fresh).toBe(true)
    expect(stale.chunks[0]!.to.getTime()).toBe(Date.parse("2026-09-25T11:57:00Z"))
  })
  it("reads the ledger in 30-day periods: a year newest first, later the last week and any older gap", () => {
    const now = Date.parse("2026-09-25T12:00:00Z")
    const today = Date.parse("2026-09-25T00:00:00Z")
    const first = ledgerChunks(now, { from: null, to: null })
    expect(first.fresh).toBe(true)
    expect(first.chunks[0]).toEqual({ from: new Date(today - 30 * day), to: new Date(today) })
    expect(first.chunks.at(-1)!.from.getTime()).toBe(today - 365 * day)
    const later = ledgerChunks(now, { from: new Date(today - 365 * day), to: new Date(today - day) })
    expect(later).toEqual({ fresh: false, chunks: [{ from: new Date(today - 8 * day), to: new Date(today) }] })
    expect(ledgerChunks(now, { from: new Date(0), to: new Date(today - 60 * day) }).fresh).toBe(true)
  })
})
