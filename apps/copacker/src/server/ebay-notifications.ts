import { createHash } from "node:crypto"
import { z } from "zod"
import { appUrl } from "./security"

// eBay sends its notifications to this address: the account deletion endpoint registered in the developer portal, and
// the destination sellers' order notifications are delivered to.
export function ebayEndpoint() {
  return `${appUrl()}/api/webhooks/ebay`
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
