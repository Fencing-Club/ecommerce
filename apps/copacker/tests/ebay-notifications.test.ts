import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../src/app/api/webhooks/ebay/route"
import { ebayChallengeResponse } from "../src/server/ebay-notifications"

const verificationToken = "copacker_ebay-verification-token-0123456789"

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://copacker.ai")
  vi.stubEnv("EBAY_VERIFICATION_TOKEN", verificationToken)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe("eBay's endpoint challenge", () => {
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
