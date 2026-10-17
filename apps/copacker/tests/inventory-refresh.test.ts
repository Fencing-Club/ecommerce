import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../src/server/http/api/inventory/refresh"

const auth = vi.hoisted(() => ({
  session: vi.fn<() => Promise<{ org: { id: string; kind: string } }>>(),
  requirePage: vi.fn<() => void>()
}))
const refresh = vi.hoisted(() =>
  vi.fn<(org: { id: string; kind: string }, selection: unknown) => Promise<{ queued: boolean }>>()
)
vi.mock("../src/server/auth", () => auth)
vi.mock("../src/server/stock", async (original) => ({
  ...(await original<typeof import("../src/server/stock")>()),
  refreshStock: refresh
}))

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://copacker.example")
  vi.stubEnv("APP_ALIAS_URLS", "https://alias.example")
  auth.session.mockResolvedValue({ org: { id: "buyer", kind: "buyer" } })
  refresh.mockResolvedValue({ queued: true })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("inventory refresh origin", () => {
  it.each([null, "https://foreign.example", "https://copacker.example.evil.test"])(
    "rejects %s before authentication or queue work",
    async (origin) => {
      const response = await POST(
        new Request("https://copacker.example/api/inventory/refresh", {
          method: "POST",
          headers: origin ? { Origin: origin } : {},
          body: JSON.stringify({ source: "awd" })
        })
      )
      expect(response.status).toBe(403)
      expect(auth.session).not.toHaveBeenCalled()
      expect(refresh).not.toHaveBeenCalled()
    }
  )
  it.each(["https://copacker.example", "https://alias.example"])("accepts the configured origin %s", async (origin) => {
    const response = await POST(
      new Request("https://copacker.example/api/inventory/refresh", {
        method: "POST",
        headers: { Origin: origin },
        body: JSON.stringify({ source: "awd" })
      })
    )
    expect(response.status).toBe(202)
    expect(refresh).toHaveBeenCalledWith({ id: "buyer", kind: "buyer" }, { source: "awd" })
  })
})
