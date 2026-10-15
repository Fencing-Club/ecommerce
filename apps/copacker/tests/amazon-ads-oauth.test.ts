import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { adsOAuthCallback, relayAdsOAuth, startAdsOAuth } from "../src/server/amazon-ads-oauth"

const relay = "https://staging.copacker.ai"
const path = "/api/connections/amazon-ads"
const local = "https://main.local.copacker.ai"
const worktree = "https://ads-fix-1234abcd.local.copacker.ai"
const preview = "https://pr-42.preview.copacker.ai"
beforeEach(() => {
  vi.stubEnv("AMAZON_ADS_RELAY_URL", relay + path)
  vi.stubEnv("AMAZON_ADS_RELAY_SECRET", Buffer.alloc(32, 4).toString("base64"))
  vi.stubEnv(
    "AMAZON_ADS_RELAY_ORIGINS",
    "https://*.local.copacker.ai,https://pr-*.preview.copacker.ai,https://owned-preview.up.railway.app"
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
function response(state: string, extra = "code=authorization-code") {
  return new Request(`${relay}${path}?state=${encodeURIComponent(state)}&${extra}`)
}

describe("shared Amazon Ads callback", () => {
  it.each([local, worktree, preview, "https://owned-preview.up.railway.app"])(
    "returns only to the signed originating app %s",
    (origin) => {
      const start = startAdsOAuth(origin)
      expect(start.callback).toBe(relay + path)
      const forwarded = relayAdsOAuth(
        response(start.state, "code=abc&redirect_uri=https://evil.example&status=1"),
        relay
      )!
      const target = new URL(forwarded.headers.get("location")!)
      expect(target.origin + target.pathname).toBe(origin + path)
      expect([...target.searchParams]).toEqual([
        ["state", start.state],
        ["code", "abc"]
      ])
      expect(forwarded.headers.get("cache-control")).toBe("no-store")
      expect(forwarded.headers.get("referrer-policy")).toBe("no-referrer")
      expect(relayAdsOAuth(new Request(target), origin)).toBeNull()
      expect(adsOAuthCallback(origin, start.state)).toBe(start.callback)
    }
  )
  it("keeps direct staging and production callbacks", () => {
    const staging = startAdsOAuth(relay)
    expect(staging.callback).toBe(relay + path)
    expect(relayAdsOAuth(response(staging.state), relay)).toBeNull()
    vi.stubEnv("AMAZON_ADS_RELAY_URL", "")
    vi.stubEnv("AMAZON_ADS_RELAY_SECRET", "")
    vi.stubEnv("AMAZON_ADS_RELAY_ORIGINS", "")
    const production = startAdsOAuth("https://copacker.ai")
    expect(production.callback).toBe("https://copacker.ai" + path)
    expect(adsOAuthCallback("https://copacker.ai", production.state)).toBe(production.callback)
  })
  it.each([
    "https://evil.example",
    "https://main.local.copacker.ai.evil.example",
    "https://main.stories.local.copacker.ai",
    "https://main.e2e.local.copacker.ai",
    "http://main.local.copacker.ai",
    "https://main.local.copacker.ai:3000",
    "https://main.local.copacker.ai/",
    "https://user@main.local.copacker.ai",
    "https://random.up.railway.app",
    "https://pr-42.stories.preview.copacker.ai",
    "https://pr-0.preview.copacker.ai",
    "https://copacker.ai"
  ])("rejects untrusted or non-app origins %s", (origin) => {
    expect(() => startAdsOAuth(origin)).toThrow(/Invalid|Origin|Wrong|Expired|Duplicate|relay|configuration/)
  })
  it("rejects tampering, wrong origin and changed relay settings", () => {
    const { state } = startAdsOAuth(local)
    expect(() => relayAdsOAuth(response(state + "x"), relay)).toThrow(
      /Invalid|Origin|Wrong|Expired|Duplicate|relay|configuration/
    )
    expect(() => relayAdsOAuth(response(state), worktree)).toThrow(
      /Invalid|Origin|Wrong|Expired|Duplicate|relay|configuration/
    )
    expect(() => adsOAuthCallback(worktree, state)).toThrow(
      /Invalid|Origin|Wrong|Expired|Duplicate|relay|configuration/
    )
    vi.stubEnv("AMAZON_ADS_RELAY_URL", "https://another.example" + path)
    expect(() => relayAdsOAuth(response(state), "https://another.example")).toThrow(
      /Invalid|Origin|Wrong|Expired|Duplicate|relay|configuration/
    )
  })
  it("rejects expired tickets and changed allowlists or signing keys", () => {
    vi.useFakeTimers()
    const { state } = startAdsOAuth(local)
    vi.advanceTimersByTime(10 * 60_000)
    expect(() => relayAdsOAuth(response(state), relay)).toThrow(
      /Invalid|Origin|Wrong|Expired|Duplicate|relay|configuration/
    )
    vi.useRealTimers()
    const current = startAdsOAuth(local).state
    vi.stubEnv("AMAZON_ADS_RELAY_ORIGINS", preview)
    expect(() => relayAdsOAuth(response(current), relay)).toThrow(
      /Invalid|Origin|Wrong|Expired|Duplicate|relay|configuration/
    )
    vi.stubEnv("AMAZON_ADS_RELAY_ORIGINS", local)
    vi.stubEnv("AMAZON_ADS_RELAY_SECRET", Buffer.alloc(32, 8).toString("base64"))
    expect(() => relayAdsOAuth(response(current), relay)).toThrow(
      /Invalid|Origin|Wrong|Expired|Duplicate|relay|configuration/
    )
  })
  it("forwards denial without forwarding arbitrary error text", () => {
    const { state } = startAdsOAuth(local)
    const result = relayAdsOAuth(response(state, "error=access_denied&error_description=private"), relay)!
    const target = new URL(result.headers.get("location")!)
    expect(target.searchParams.get("error")).toBe("access_denied")
    expect(target.searchParams.has("error_description")).toBe(false)
  })
  it("accepts modest clock skew but rejects implausibly future tickets", () => {
    vi.useFakeTimers()
    const started = Date.now()
    const { state } = startAdsOAuth(local)
    vi.setSystemTime(started - 15_000)
    expect(relayAdsOAuth(response(state), relay)?.status).toBe(302)
    vi.setSystemTime(started - 120_000)
    expect(() => relayAdsOAuth(response(state), relay)).toThrow("Expired relay state")
  })
  it.each(["", "code=a&error=b", "code=a&code=b", "error=a&error=b", "code=a&state=second"])(
    "rejects ambiguous responses %s",
    (query) => {
      expect(() => relayAdsOAuth(response(startAdsOAuth(local).state, query), relay)).toThrow(
        /Invalid|Origin|Wrong|Expired|Duplicate|relay|configuration/
      )
    }
  )
  it("fails closed when relay configuration is missing or partial", () => {
    const { state } = startAdsOAuth(local)
    vi.stubEnv("AMAZON_ADS_RELAY_SECRET", "")
    expect(() => startAdsOAuth(local)).toThrow(/Invalid|Origin|Wrong|Expired|Duplicate|relay|configuration/)
    vi.stubEnv("AMAZON_ADS_RELAY_URL", "")
    expect(() => relayAdsOAuth(response(state), relay)).toThrow(
      /Invalid|Origin|Wrong|Expired|Duplicate|relay|configuration/
    )
  })
})
