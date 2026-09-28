import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// WorkOS's feature flags as the runtime client holds them: whether the maintenance flag is on for everyone, and
// whether its first read has finished.
const flags = vi.hoisted(() => ({ on: false, ready: Promise.resolve(), listeners: 0 }))
const client = vi.hoisted(() => ({
  listenerCount: () => flags.listeners,
  on: vi.fn<(event: string, listener: (error: Error) => void) => void>(() => void flags.listeners++),
  waitUntilReady: () => flags.ready,
  isEnabled: (key: string) => key === "maintenance" && flags.on
}))
vi.mock("@workos-inc/authkit-nextjs", () => ({ getFeatureFlagsRuntimeClient: () => client }))

import { maintenanceHeader } from "../src/lib/maintenance"
import { closedForMaintenance, maintenanceResponse, underMaintenance } from "../src/server/maintenance"

beforeEach(() => {
  vi.stubEnv("WORKOS_API_KEY", "sk_test")
  flags.on = false
})
afterEach(() => {
  vi.unstubAllEnvs()
})

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "https://copacker.ai"), init)
}

describe("the maintenance flag", () => {
  it("follows the WorkOS flag, reading it once per server", async () => {
    expect(await underMaintenance()).toBe(false)
    flags.on = true
    expect(await underMaintenance()).toBe(true)
    expect(client.on).toHaveBeenCalledTimes(1)
  })

  it("keeps Copacker up without WorkOS settings", async () => {
    vi.stubEnv("WORKOS_API_KEY", "")
    flags.on = true
    expect(await underMaintenance()).toBe(false)
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
      "/_next/webpack-hmr"
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
})

describe("what someone gets during maintenance", () => {
  // A marked page request goes on, and next.config.ts shows it the maintenance page at its own address.
  const marked = (response: Response) =>
    response.headers.get("x-middleware-next") === "1" &&
    response.headers.get(`x-middleware-request-${maintenanceHeader}`) === "1"

  it("shows a page the maintenance page at its own address, as a 503 to come back to", async () => {
    const response = await maintenanceResponse(request("/orders/123"))
    expect(response.status).toBe(503)
    expect(response.headers.get("retry-after")).toBe("120")
    expect(marked(response)).toBe(true)
  })

  it("shows the page for an API address the browser opens itself, such as a store connection's return", async () => {
    const response = await maintenanceResponse(
      request("/api/connections/shopify?code=abc", { headers: { "sec-fetch-dest": "document" } })
    )
    expect(marked(response)).toBe(true)
  })

  it("answers the app's requests and server actions with the reason, in the browser's language", async () => {
    const api = await maintenanceResponse(request("/api/search", { headers: { "accept-language": "de-DE,de;q=0.9" } }))
    expect(api.status).toBe(503)
    expect(marked(api)).toBe(false)
    expect(await api.json()).toEqual({ error: "Copacker wird gerade gewartet. Versuchen Sie es bald erneut." })

    const action = await maintenanceResponse(
      request("/orders/123", { method: "POST", headers: { "next-action": "abc" } })
    )
    expect(action.status).toBe(503)
    expect(await action.json()).toEqual({ error: "Copacker is down for maintenance. Try again soon." })
  })
})
