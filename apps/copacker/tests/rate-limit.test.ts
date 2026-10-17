import { describe, expect, it } from "vitest"
import { clientAddress } from "../src/server/rate-limit"

describe("Cloudflare client address", () => {
  it("uses the edge address instead of an attacker-controlled forwarding chain", () => {
    const request = new Request("https://copacker.example", {
      headers: { "cf-connecting-ip": "198.51.100.10", "x-forwarded-for": "203.0.113.99, 198.51.100.10" }
    })
    expect(clientAddress(request)).toBe("198.51.100.10")
  })
  it("does not trust forwarded headers when the edge address is absent", () => {
    expect(
      clientAddress(
        new Request("https://copacker.example", {
          headers: { "x-forwarded-for": "203.0.113.99" }
        })
      )
    ).toBe("unknown")
  })
})
