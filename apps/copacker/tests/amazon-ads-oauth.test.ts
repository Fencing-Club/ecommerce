import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { adsOAuthCallback, relayAdsOAuth, startAdsOAuth } from "../src/server/amazon-ads-oauth"
import { StatusError } from "../src/server/errors"

const relay = "https://staging.copacker.ai"
const path = "/api/connections/amazon-ads"
const local = "https://local.copacker.ai"
const worktree = "https://ads-fix.local.copacker.ai"
const preview = "https://pr-42.preview.copacker.ai"
const warned = vi.spyOn(console, "warn")
const logged = vi.spyOn(console, "error")
beforeEach(() => {
  warned.mockReset().mockImplementation(() => undefined)
  logged.mockReset().mockImplementation(() => undefined)
  vi.stubEnv("AMAZON_ADS_RELAY_URL", relay + path)
  vi.stubEnv("AMAZON_ADS_RELAY_SECRET", Buffer.alloc(32, 4).toString("base64"))
  vi.stubEnv(
    "AMAZON_ADS_RELAY_ORIGINS",
    "https://local.copacker.ai,https://*.local.copacker.ai,https://pr-*.preview.copacker.ai,https://owned-preview.up.railway.app"
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
function response(state: string, extra = "code=authorization-code") {
  return new Request(`${relay}${path}?state=${encodeURIComponent(state)}&${extra}`)
}
const lines = (spy: typeof warned) => spy.mock.calls.map(([line]) => JSON.parse(String(line)))
// A relay that's set up wrong throws that Amazon Ads is unavailable, and logs what's wrong.
const unavailable = expect.objectContaining({ key: "amazonConnectionFailed", status: 503 })
const misconfigured = (problem: RegExp) => ({
  event: "amazon_ads_relay_misconfigured",
  problem: expect.stringMatching(problem)
})
const lastError = () => lines(logged).at(-1)

describe("shared Amazon Ads callback", () => {
  it.each([local, worktree, preview, "https://owned-preview.up.railway.app"])(
    "returns only to the signed originating app %s",
    (origin) => {
      const start = startAdsOAuth(origin)
      expect(start.callback).toBe(relay + path)
      const forwarded = relayAdsOAuth(
        response(start.state, "code=abc&redirect_uri=https://evil.example&status=1"),
        relay
      )
      expect(forwarded).toBeInstanceOf(Response)
      const headers = forwarded instanceof Response ? forwarded.headers : new Headers()
      const target = new URL(headers.get("location")!)
      expect(target.origin + target.pathname).toBe(origin + path)
      expect([...target.searchParams]).toEqual([
        ["state", start.state],
        ["code", "abc"]
      ])
      expect(headers.get("cache-control")).toBe("no-store")
      expect(headers.get("referrer-policy")).toBe("no-referrer")
      expect(relayAdsOAuth(new Request(target), origin)).toBeNull()
      expect(adsOAuthCallback(origin, start.state)).toBe(start.callback)
      expect(warned).not.toHaveBeenCalled()
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
  it("refuses a relayed state at an app without a relay", () => {
    const { state } = startAdsOAuth(local)
    vi.stubEnv("AMAZON_ADS_RELAY_URL", "")
    vi.stubEnv("AMAZON_ADS_RELAY_SECRET", "")
    vi.stubEnv("AMAZON_ADS_RELAY_ORIGINS", "")
    expect(relayAdsOAuth(response(state), "https://copacker.ai")).toEqual({ refused: "invalid state" })
    expect(adsOAuthCallback("https://copacker.ai", state)).toEqual({ refused: "invalid state" })
    expect(logged).not.toHaveBeenCalled()
  })
  it.each([
    "https://evil.example",
    "https://local.copacker.ai.evil.example",
    "https://stories.local.copacker.ai",
    "https://e2e.local.copacker.ai",
    "https://hooks.local.copacker.ai",
    "https://feature.stories.local.copacker.ai",
    "https://feature.e2e.local.copacker.ai",
    "http://local.copacker.ai",
    "https://local.copacker.ai:3000",
    "https://local.copacker.ai/",
    "https://user@local.copacker.ai",
    "https://random.up.railway.app",
    "https://pr-42.stories.preview.copacker.ai",
    "https://pr-0.preview.copacker.ai",
    "https://copacker.ai"
  ])("won't start from an app the relay doesn't list, %s", (origin) => {
    expect(() => startAdsOAuth(origin)).toThrow(unavailable)
    expect(lastError()).toEqual(misconfigured(/isn't in AMAZON_ADS_RELAY_ORIGINS/))
  })
  it("requires the primary origin explicitly rather than expanding the worktree wildcard", () => {
    vi.stubEnv("AMAZON_ADS_RELAY_ORIGINS", "https://*.local.copacker.ai")
    expect(() => startAdsOAuth(local)).toThrow(unavailable)
    expect(lastError()).toEqual(misconfigured(/isn't in AMAZON_ADS_RELAY_ORIGINS/))
    expect(startAdsOAuth(worktree).callback).toBe(relay + path)
  })
  it("refuses tampering, a wrong origin and changed relay settings", () => {
    const { state } = startAdsOAuth(local)
    expect(relayAdsOAuth(response(state + "x"), relay)).toEqual({ refused: "invalid signature" })
    expect(relayAdsOAuth(response(state), worktree)).toEqual({ refused: "wrong origin" })
    expect(adsOAuthCallback(worktree, state)).toEqual({ refused: "wrong origin" })
    expect(relayAdsOAuth(response("ads-relay.not-a-ticket"), relay)).toEqual({ refused: "invalid state" })
    vi.stubEnv("AMAZON_ADS_RELAY_URL", "https://another.example" + path)
    expect(relayAdsOAuth(response(state), "https://another.example")).toEqual({ refused: "wrong destination" })
    expect(lines(warned)).toContainEqual({ event: "amazon_ads_relay_refused", reason: "wrong destination" })
    expect(logged).not.toHaveBeenCalled()
  })
  it("refuses expired tickets and changed allowlists or signing keys", () => {
    vi.useFakeTimers()
    const { state } = startAdsOAuth(local)
    vi.advanceTimersByTime(10 * 60_000)
    expect(relayAdsOAuth(response(state), relay)).toEqual({ refused: "expired" })
    vi.useRealTimers()
    const current = startAdsOAuth(local).state
    vi.stubEnv("AMAZON_ADS_RELAY_ORIGINS", preview)
    expect(relayAdsOAuth(response(current), relay)).toEqual({ refused: "wrong destination" })
    vi.stubEnv("AMAZON_ADS_RELAY_ORIGINS", local)
    vi.stubEnv("AMAZON_ADS_RELAY_SECRET", Buffer.alloc(32, 8).toString("base64"))
    expect(relayAdsOAuth(response(current), relay)).toEqual({ refused: "invalid signature" })
  })
  it("forwards denial without forwarding arbitrary error text", () => {
    const { state } = startAdsOAuth(local)
    const result = relayAdsOAuth(response(state, "error=access_denied&error_description=private"), relay)
    const target = new URL(result instanceof Response ? result.headers.get("location")! : "about:blank")
    expect(target.searchParams.get("error")).toBe("access_denied")
    expect(target.searchParams.has("error_description")).toBe(false)
  })
  it("accepts modest clock skew but refuses implausibly future tickets", () => {
    vi.useFakeTimers()
    const started = Date.now()
    const { state } = startAdsOAuth(local)
    vi.setSystemTime(started - 15_000)
    expect(relayAdsOAuth(response(state), relay)).toMatchObject({ status: 302 })
    vi.setSystemTime(started - 120_000)
    expect(relayAdsOAuth(response(state), relay)).toEqual({ refused: "expired" })
  })
  it.each(["", "code=a&error=b", "code=a&code=b", "error=a&error=b", "code=a&state=second"])(
    "refuses ambiguous responses %s",
    (query) => {
      expect(relayAdsOAuth(response(startAdsOAuth(local).state, query), relay)).toEqual({ refused: "invalid response" })
    }
  )
  it("logs a relay that's missing settings or set up wrong, and says Amazon Ads is unavailable", () => {
    const { state } = startAdsOAuth(local)
    vi.stubEnv("AMAZON_ADS_RELAY_SECRET", "")
    expect(() => startAdsOAuth(local)).toThrow(StatusError)
    expect(() => startAdsOAuth(local)).toThrow(unavailable)
    expect(lastError()).toEqual(misconfigured(/both required/))
    vi.stubEnv("AMAZON_ADS_RELAY_URL", "")
    expect(() => relayAdsOAuth(response(state), relay)).toThrow(unavailable)
    expect(lastError()).toEqual(misconfigured(/both required/))
    vi.stubEnv("AMAZON_ADS_RELAY_URL", relay + "/elsewhere")
    vi.stubEnv("AMAZON_ADS_RELAY_SECRET", Buffer.alloc(32, 4).toString("base64"))
    expect(() => adsOAuthCallback(local, state)).toThrow(unavailable)
    expect(lastError()).toEqual(misconfigured(/AMAZON_ADS_RELAY_URL must be/))
    vi.stubEnv("AMAZON_ADS_RELAY_URL", relay + path)
    vi.stubEnv("AMAZON_ADS_RELAY_SECRET", Buffer.alloc(16, 4).toString("base64"))
    expect(() => startAdsOAuth(local)).toThrow(unavailable)
    expect(lastError()).toEqual(misconfigured(/32 bytes/))
    vi.stubEnv("AMAZON_ADS_RELAY_SECRET", Buffer.alloc(32, 4).toString("base64"))
    vi.stubEnv("AMAZON_ADS_RELAY_ORIGINS", " , ")
    expect(() => startAdsOAuth(local)).toThrow(unavailable)
    expect(lastError()).toEqual(misconfigured(/is required/))
    vi.stubEnv("AMAZON_ADS_RELAY_ORIGINS", "http://local.copacker.ai")
    expect(() => startAdsOAuth(local)).toThrow(unavailable)
    expect(lastError()).toEqual(misconfigured(/must list https origins/))
    expect(warned).not.toHaveBeenCalled()
  })
})
