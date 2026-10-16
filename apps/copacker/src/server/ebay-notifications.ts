import { createHash } from "node:crypto"
import { z } from "zod"
import { appUrl } from "./security"

// eBay sends its notifications to this address: the account deletion endpoint registered in the developer portal, and
// the destination sellers' order notifications are delivered to.
export function ebayEndpoint() {
  const origin = process.env.WEBHOOK_BASE_URL || appUrl()
  return `${new URL(origin).origin}/api/webhooks/ebay`
}

// A local HTTPS origin is still loopback. Live delivery requires an explicitly owned public endpoint.
export function hasPublicEbayEndpoint() {
  if (process.env.COPACKER_LOCAL === "1" && !process.env.WEBHOOK_BASE_URL) {
    return false
  }
  const url = new URL(ebayEndpoint())
  const isLocal = url.hostname === "local.copacker.ai" || url.hostname.endsWith(".local.copacker.ai")
  return (
    url.protocol === "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    !url.hostname.endsWith(".localhost") &&
    !isLocal &&
    !url.hostname.endsWith(".dev.copacker.ai")
  )
}

// The token entered next to the endpoint in the developer portal: 32 to 80 letters, digits, underscores or hyphens.
export function ebayVerificationToken() {
  const parsed = z
    .string()
    .regex(/^[\w-]{32,80}$/)
    .safeParse(process.env.EBAY_VERIFICATION_TOKEN)
  return parsed.success ? parsed.data : null
}

// eBay checks the endpoint by sending a challenge code. The answer hashes the code, the verification token and the
// endpoint, in that order.
export function ebayChallengeResponse(challengeCode: string, verificationToken: string, endpoint = ebayEndpoint()) {
  return createHash("sha256").update(challengeCode).update(verificationToken).update(endpoint).digest("hex")
}
