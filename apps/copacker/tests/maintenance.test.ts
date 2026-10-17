import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { maintenanceRewrite } from "../src/lib/maintenance"
import {
  closedForMaintenance,
  maintenanceActive,
  maintenanceReader,
  underMaintenance,
  withMaintenance
} from "../src/server/maintenance"
import { maintenanceResponse as startMaintenanceResponse } from "../src/server/start-maintenance"

const fetcher = vi.fn<typeof fetch>()
const value = (enabled: boolean, defaultValue: boolean) => Response.json({ enabled, default_value: defaultValue })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"))
  fetcher.mockReset()
  vi.stubGlobal("fetch", fetcher)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.stubEnv("WORKOS_API_KEY", "sk_test")
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new Request(new URL(path, "https://copacker.ai"), init)
}

describe("the maintenance flag", () => {
  it("caches completed values for ten seconds and refreshes within the next request", async () => {
    const read = maintenanceReader("sk_example")
    fetcher.mockResolvedValueOnce(value(true, true)).mockResolvedValueOnce(value(true, false))
    expect(await read()).toBe(true)
    expect(await read()).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await read()).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.workos.com/feature-flags/maintenance",
      expect.objectContaining({
        headers: { Authorization: "Bearer sk_example", Accept: "application/json" },
        redirect: "manual"
      })
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    [true, false],
    [false, true],
    [false, false]
  ])("keeps the app open with enabled=%s and default=%s", async (enabled, defaultValue) => {
    fetcher.mockResolvedValueOnce(value(enabled, defaultValue))
    expect(await maintenanceReader("sk_example")()).toBe(false)
  })

  it("stays available on a cold failure and retains a warm setting on later failures", async () => {
    const read = maintenanceReader("sk_example")
    fetcher
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(value(true, true))
      .mockResolvedValueOnce(new Response("sensitive provider error", { status: 503 }))
    expect(await read()).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await read()).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await read()).toBe(true)
    expect(await read()).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("sensitive")
  })

  it("recognizes a deleted flag and rejects malformed successful responses", async () => {
    const read = maintenanceReader("sk_example")
    fetcher
      .mockResolvedValueOnce(value(true, true))
      .mockResolvedValueOnce(Response.json({ enabled: "false", default_value: true }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    expect(await read()).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await read()).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await read()).toBe(false)
  })

  it("retains maintenance on a provider redirect without following its destination", async () => {
    const read = maintenanceReader("sk_example")
    fetcher
      .mockResolvedValueOnce(value(true, true))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://elsewhere.test" } }))
    expect(await read()).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await read()).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("aborts both a stalled request and a stalled response body within two seconds", async () => {
    for (const body of [false, true]) {
      fetcher.mockImplementationOnce(async (_input, init) => {
        if (body) {
          return new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true })
              }
            })
          )
        }
        return new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
        )
      })
      const reading = maintenanceReader("sk_example")()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(await reading).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    }
  })

  it("owns overlapping I/O separately and ignores an older response that finishes later", async () => {
    const older = Promise.withResolvers<Response>()
    const newer = Promise.withResolvers<Response>()
    fetcher.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const read = maintenanceReader("sk_example")
    const first = read(),
      second = read()
    expect(fetcher).toHaveBeenCalledTimes(2)
    newer.resolve(value(true, false))
    expect(await second).toBe(false)
    older.resolve(value(true, true))
    expect(await first).toBe(false)
    expect(await read()).toBe(false)
  })

  it("does not reuse a previous environment's snapshot after a credential change", async () => {
    fetcher.mockResolvedValueOnce(value(true, true)).mockResolvedValueOnce(value(true, false))
    vi.stubEnv("WORKOS_API_KEY", "sk_environment_a")
    expect(await underMaintenance()).toBe(true)
    vi.stubEnv("WORKOS_API_KEY", "sk_environment_b")
    expect(await underMaintenance()).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("keeps Copacker up without WorkOS settings", async () => {
    vi.stubEnv("WORKOS_API_KEY", "")
    expect(await underMaintenance()).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe("what maintenance closes", () => {
  it("keeps the marketing site, its forms and its files up", () => {
    const open = [
      "/privacy",
      "/terms",
      "/contact",
      "/unsubscribe",
      "/robots.txt",
      "/sitemap.xml",
      "/marketing/og.jpg",
      "/email/mark.png",
      "/api/contact",
      "/api/mailing-list",
      "/api/mailing-list/unsubscribe",
      "/api/maintenance",
      "/api/health",
      "/fonts/geist-latin.woff2",
      "/assets/entry.js",
      "/@vite/client"
    ]
    expect(open.filter((path) => closedForMaintenance(request(path)))).toEqual([])
  })

  it("closes the app, signing in, and the API behind them", () => {
    const closed = [
      "/overview",
      "/orders/123",
      "/settings",
      "/login",
      "/signup",
      "/invite",
      "/callback",
      "/onboarding",
      "/maintenance",
      "/api/action",
      "/api/connections/shopify",
      "/api/contacts",
      "/privacy-center"
    ]
    expect(closed.filter((path) => !closedForMaintenance(request(path)))).toEqual([])
  })

  it("shows home's marketing page to visitors, but not to someone signed in, whom it takes to their workspace", () => {
    expect(closedForMaintenance(request("/"))).toBe(false)
    expect(closedForMaintenance(request("/", { headers: { cookie: "wos-session=abc" } }))).toBe(true)
  })

  it("matches the exact configured session cookie name", () => {
    vi.stubEnv("WORKOS_COOKIE_NAME", "migration-session")
    expect(
      closedForMaintenance(request("/", { headers: { cookie: "wos-session=abc; other-migration-session=abc" } }))
    ).toBe(false)
    expect(closedForMaintenance(request("/", { headers: { cookie: "other=1; migration-session=abc" } }))).toBe(true)
  })
})

describe("Start maintenance before authentication and database work", () => {
  it("round trips the requested address and isolates each router's rewrite", () => {
    const first = maintenanceRewrite(true),
      second = maintenanceRewrite(true)
    const login = "https://copacker.ai/login?next=%2Forders%3Ftab%3Dopen#recovery"
    const order = "https://copacker.ai/orders/123?tab=files"
    const internal = first.input({ url: new URL(login) })
    expect(internal.pathname).toBe("/maintenance")
    expect(internal.search).toBe("")
    second.input({ url: new URL(order) })
    // An internal match must not replace the saved public address during hydration.
    first.input({ url: new URL(internal) })
    expect(first.output({ url: internal }).href).toBe(login)
    expect(second.output({ url: internal }).href).toBe(order)
    const inactive = maintenanceRewrite(false)
    expect(inactive.output({ url: inactive.input({ url: new URL(login) }) }).href).toBe(login)
  })

  it("renders the maintenance route with internal context while preserving the caller's URL", async () => {
    const original = request("/orders/123?secret=hidden", {
      headers: { "accept-language": "ur", cookie: "migration-session=invalid" }
    })
    const render = vi.fn<Parameters<typeof startMaintenanceResponse>[1]>(async (rewritten) => {
      expect(maintenanceActive()).toBe(true)
      expect(rewritten).toBe(original)
      expect(rewritten.headers.get("accept-language")).toBe("ur")
      return new Response("<html>Maintenance</html>", {
        headers: { "Content-Type": "text/html", "X-Frame-Options": "DENY" }
      })
    })
    const response = await startMaintenanceResponse(original, render)
    expect(response.status).toBe(503)
    expect(response.headers.get("retry-after")).toBe("120")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-frame-options")).toBe("DENY")
    expect(response.headers.has("location")).toBe(false)
    expect(original.url).toBe("https://copacker.ai/orders/123?secret=hidden")
    expect(maintenanceActive()).toBe(false)
    expect(render).toHaveBeenCalledOnce()
  })

  it("returns localized 503 JSON for APIs and Start server functions, without rendering", async () => {
    const render = vi.fn<Parameters<typeof startMaintenanceResponse>[1]>()
    for (const path of ["/api/action", "/_serverFn/some-function"]) {
      const response = await startMaintenanceResponse(request(path, { headers: { "accept-language": "de" } }), render)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: "Copacker wird gerade gewartet. Versuchen Sie es bald erneut." })
    }
    expect(render).not.toHaveBeenCalled()
  })

  it("returns HEAD headers without rendering or a response body", async () => {
    const render = vi.fn<Parameters<typeof startMaintenanceResponse>[1]>()
    const response = await startMaintenanceResponse(request("/orders", { method: "HEAD" }), render)
    expect(response.status).toBe(503)
    expect(response.body).toBeNull()
    expect(render).not.toHaveBeenCalled()
  })

  it("isolates active and inactive request contexts", async () => {
    const values = await Promise.all(
      [true, false].map((active) =>
        withMaintenance(active, async () => {
          await Promise.resolve()
          return maintenanceActive()
        })
      )
    )
    expect(values).toEqual([true, false])
    expect(maintenanceActive()).toBe(false)
  })
})
