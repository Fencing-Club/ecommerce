import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { keepForBackForwardCache } from "../src/server/back-forward-cache"

afterEach(() => {
  vi.unstubAllEnvs()
})

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "https://copacker.ai"), init)
}

const caching = (path: string, init?: Parameters<typeof request>[1], response = NextResponse.next()) =>
  keepForBackForwardCache(request(path, init), response).headers.get("cache-control")

describe("the back/forward cache", () => {
  it("lets a signed-out visitor's marketing pages be restored", () => {
    const pages = ["/", "/contact", "/privacy", "/terms", "/unsubscribe?email=a%40example.net&token=x"]
    expect(pages.map((path) => caching(path))).toEqual(pages.map(() => "private, no-cache"))
    expect(caching("/contact", { method: "HEAD" })).toBe("private, no-cache")
  })

  it("leaves the pages of someone signed in as Next.js sends them", () => {
    expect(caching("/", { headers: { cookie: "wos-session=sealed" } })).toBeNull()
    expect(caching("/contact", { headers: { cookie: "wos-session=sealed" } })).toBeNull()
    vi.stubEnv("WORKOS_COOKIE_NAME", "session")
    expect(caching("/privacy", { headers: { cookie: "session=sealed" } })).toBeNull()
  })

  it("leaves the app, its API, posts and other responses alone", () => {
    expect(caching("/overview")).toBeNull()
    expect(caching("/api/contact")).toBeNull()
    expect(caching("/contact", { method: "POST" })).toBeNull()
    expect(caching("/", {}, NextResponse.redirect("https://copacker.ai/overview"))).toBeNull()
    const cookie = NextResponse.next()
    cookie.cookies.set("wos-session", "")
    expect(caching("/", {}, cookie)).toBeNull()
    const own = NextResponse.next({ headers: { "Cache-Control": "no-store" } })
    expect(caching("/", {}, own)).toBe("no-store")
  })
})
