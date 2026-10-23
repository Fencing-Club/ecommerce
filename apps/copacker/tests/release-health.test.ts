import { afterEach, describe, expect, it, vi } from "vitest"
import { verifyReleaseHealth } from "../scripts/release-health"

vi.mock("node:timers/promises", () => ({ setTimeout: async () => undefined }))
afterEach(() => vi.unstubAllGlobals())
describe("release health propagation", () => {
  it("waits through old assets and transient failures for the exact commit", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ commit: "old" }))
      .mockRejectedValueOnce(new Error("temporary network error"))
      .mockResolvedValueOnce(Response.json({ commit: "expected" }))
    vi.stubGlobal("fetch", request)
    await verifyReleaseHealth(new URL("https://preview.test/health.json"), "expected")
    expect(request).toHaveBeenCalledTimes(3)
    expect(request).toHaveBeenLastCalledWith(expect.any(URL), expect.objectContaining({ cache: "no-store" }))
  })
  it("never qualifies a deployment that keeps serving another commit", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ commit: "old" }))
    vi.stubGlobal("fetch", request)
    await expect(verifyReleaseHealth(new URL("https://preview.test/health.json"), "expected")).rejects.toThrow(
      "did not serve release expected"
    )
    expect(request).toHaveBeenCalledTimes(30)
  })
})
