import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../src/app/api/webhooks/ebay/route"
import { ebayChallengeResponse, ebayEndpoint, hasPublicEbayEndpoint } from "../src/server/ebay-notifications"

const verificationToken = "copacker_ebay-verification-token-0123456789"

beforeEach(() => {
  vi.stubEnv("WEBHOOK_BASE_URL", "")
  vi.stubEnv("COPACKER_LOCAL", "")
  vi.stubEnv("APP_URL", "https://copacker.ai")
  vi.stubEnv("EBAY_VERIFICATION_TOKEN", verificationToken)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe("eBay's endpoint challenge", () => {
  it("never subscribes a local HTTPS app as a public endpoint", () => {
    vi.stubEnv("APP_URL", "https://local.copacker.ai")
    expect(hasPublicEbayEndpoint()).toBe(false)
    vi.stubEnv("WEBHOOK_BASE_URL", "https://e2e.local.copacker.ai")
    expect(hasPublicEbayEndpoint()).toBe(false)
    vi.stubEnv("WEBHOOK_BASE_URL", "")
    vi.stubEnv("COPACKER_LOCAL", "1")
    vi.stubEnv("APP_URL", "https://copacker.ai")
    expect(hasPublicEbayEndpoint()).toBe(false)
  })
  it("rejects loopback domain aliases even when explicitly configured", () => {
    vi.stubEnv("APP_URL", "https://hooks.local.copacker.ai")
    expect(hasPublicEbayEndpoint()).toBe(false)
    vi.stubEnv("WEBHOOK_BASE_URL", "https://hooks.local.copacker.ai")
    expect(hasPublicEbayEndpoint()).toBe(false)
    vi.stubEnv("WEBHOOK_BASE_URL", "https://slot1.hooks.dev.copacker.ai")
    expect(hasPublicEbayEndpoint()).toBe(false)
  })
  it("uses the owned public slot for both delivery and challenge hashing", () => {
    vi.stubEnv("COPACKER_LOCAL", "1")
    vi.stubEnv("APP_URL", "https://local.copacker.ai")
    vi.stubEnv("WEBHOOK_BASE_URL", "https://copacker-dev.example.com")
    expect(ebayEndpoint()).toBe("https://copacker-dev.example.com/api/webhooks/ebay")
    expect(hasPublicEbayEndpoint()).toBe(true)
    expect(ebayChallengeResponse("abc", verificationToken)).toBe(
      createHash("sha256").update(`abc${verificationToken}${ebayEndpoint()}`).digest("hex")
    )
  })
  it("hashes the challenge code, the verification token and the endpoint", async () => {
    const response = GET(new Request("http://internal:8080/api/webhooks/ebay?challenge_code=a8628072-3d33-45ee-9004"))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    // The public address, not the one the request reached the service on.
    const expected = createHash("sha256")
      .update(`a8628072-3d33-45ee-9004${verificationToken}https://copacker.ai/api/webhooks/ebay`)
      .digest("hex")
    expect(await response.json()).toEqual({ challengeResponse: expected })
    expect(ebayChallengeResponse("a8628072-3d33-45ee-9004", verificationToken)).toBe(expected)
  })

  it("needs a challenge code", () => {
    expect(GET(new Request("https://copacker.ai/api/webhooks/ebay")).status).toBe(400)
  })

  it("answers nothing without a valid verification token", () => {
    vi.stubEnv("EBAY_VERIFICATION_TOKEN", "too-short")
    expect(GET(new Request("https://copacker.ai/api/webhooks/ebay?challenge_code=abc")).status).toBe(503)
  })
})
