import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET, POST } from "../src/app/api/webhooks/ebay/route"
import { ebayChallengeResponse } from "../src/server/ebay-notifications"

const verificationToken = "copacker_ebay-verification-token-0123456789"

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://copacker.ai")
  vi.stubEnv("EBAY_VERIFICATION_TOKEN", verificationToken)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
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

describe("eBay notifications", () => {
  const post = (body: unknown) =>
    POST(
      new Request("https://copacker.ai/api/webhooks/ebay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    )

  it("acknowledges an account deletion notice", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const response = await post({
      metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0", deprecated: false },
      notification: {
        notificationId: "49feeaeb-4982-42d9-a377-9645b8479411_33f7e043",
        eventDate: "2026-09-28T20:43:59.462Z",
        publishDate: "2026-09-28T20:43:59.679Z",
        publishAttemptCount: 1,
        data: { username: "test_user", userId: "ma8vp1jySJC", eiasToken: "nY+sHZ2PrBmdj6wVnY" }
      }
    })
    expect(response.status).toBe(204)
    // Only the topic and notice are logged, not who asked to be deleted.
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      event: "ebay_notification",
      topic: "MARKETPLACE_ACCOUNT_DELETION",
      notificationId: "49feeaeb-4982-42d9-a377-9645b8479411_33f7e043"
    })
  })

  it("refuses anything that isn't a notification", async () => {
    expect((await post({ hello: "world" })).status).toBe(400)
  })
})
