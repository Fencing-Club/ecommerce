import { afterEach, describe, expect, it, vi } from "vitest"
import { amazonShipmentCache } from "../src/server/amazon-shipment-cache"

afterEach(() => vi.useRealTimers())
describe("Amazon shipment cache", () => {
  it("expires completed reads and isolates workspace and connection generations", async () => {
    vi.useFakeTimers()
    const read = amazonShipmentCache()
    const load = vi.fn<() => Promise<[]>>(async () => [])
    await read("workspace-a:connection-a", load)
    await read("workspace-a:connection-a", load)
    expect(load).toHaveBeenCalledTimes(1)
    await read("workspace-b:connection-a", load)
    await read("workspace-a:connection-b", load)
    expect(load).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(60_001)
    await read("workspace-a:connection-a", load)
    expect(load).toHaveBeenCalledTimes(4)
  })
  it("never shares pending I/O or caches a failed request", async () => {
    const read = amazonShipmentCache()
    const first = Promise.withResolvers<[]>()
    const second = Promise.withResolvers<[]>()
    const load = vi.fn<() => Promise<[]>>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = read("a", load)
    const b = read("a", load)
    expect(load).toHaveBeenCalledTimes(2)
    second.resolve([])
    await expect(b).resolves.toEqual([])
    first.resolve([])
    await expect(a).resolves.toEqual([])
    await expect(
      read("failed", async () => {
        throw new Error("offline")
      })
    ).rejects.toThrow("offline")
    await expect(read("failed", async () => [])).resolves.toEqual([])
  })
  it("bounds retained workspaces", async () => {
    const read = amazonShipmentCache()
    for (let index = 0; index < 21; index++) {
      await read(String(index), async () => [])
    }
    const load = vi.fn<() => Promise<[]>>(async () => [])
    await read("0", load)
    expect(load).toHaveBeenCalledOnce()
  })
})
