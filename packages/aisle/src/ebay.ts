import { createPublicKey, createVerify } from "node:crypto"
import { z } from "zod"
import { ProviderError } from "./amazon"

// What Copacker asks a seller to allow: reading their orders, their account's ID and name, and subscribing to their
// order notifications. api_scope is the base scope every token needs.
export const ebayScopes = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription"
]
const appScope = "https://api.ebay.com/oauth/api_scope"
const api = "https://api.ebay.com"

export type EbayCredentials =
  | { clientId: string; clientSecret: string; refreshToken: string }
  // The app's own token, for the notification destination and eBay's signing keys.
  | { clientId: string; clientSecret: string }

// eBay's sign-in page. `ruName` is the redirect URL name set up in the developer portal, which says where eBay returns.
export function ebayAuthorizeUrl(clientId: string, ruName: string, state: string) {
  const url = new URL("https://auth.ebay.com/oauth2/authorize")
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: ruName,
    response_type: "code",
    scope: ebayScopes.join(" "),
    state
  }).toString()
  return url
}

const tokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().int().positive().optional()
})

async function requestToken(
  credentials: { clientId: string; clientSecret: string },
  body: Record<string, string>,
  transport: typeof fetch
) {
  const response = await transport(`${api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    // eBay says why in error and error_description, which describe the request, not the seller.
    const reason = z
      .object({ error: z.string(), error_description: z.string().optional() })
      .safeParse(await response.json().catch(() => null))
    throw new ProviderError(
      response.status,
      response.headers.get("x-ebay-c-request-id"),
      `eBay authorization failed (${response.status})${reason.success ? `: ${[reason.data.error, reason.data.error_description].filter(Boolean).join(" ").slice(0, 300)}` : ""}`
    )
  }
  return tokenResponse.parse(await response.json())
}

// Trades the code eBay returns after sign-in for the seller's refresh token, which lasts about 18 months.
export async function exchangeEbayCode(
  credentials: { clientId: string; clientSecret: string },
  ruName: string,
  code: string,
  transport: typeof fetch = fetch
) {
  const token = await requestToken(
    credentials,
    { grant_type: "authorization_code", code, redirect_uri: ruName },
    transport
  )
  if (!token.refresh_token) {
    throw new Error("eBay didn't return a refresh token")
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    refreshTokenExpiresAt: token.refresh_token_expires_in
      ? new Date(Date.now() + token.refresh_token_expires_in * 1000)
      : null
  }
}

const errors = z.object({
  errors: z
    .array(
      z.object({ errorId: z.number().optional(), message: z.string().optional(), longMessage: z.string().optional() })
    )
    .max(20)
})

const publicKey = z.object({ algorithm: z.string(), digest: z.string(), key: z.string().min(1) })
const destination = z.object({
  destinationId: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  deliveryConfig: z.object({ endpoint: z.string().optional() }).optional()
})
const subscription = z.object({
  subscriptionId: z.string(),
  topicId: z.string(),
  status: z.string().optional(),
  destinationId: z.string().optional()
})

export class Ebay {
  private access?: { token: string; expires: number }
  constructor(
    private credentials: EbayCredentials,
    private transport: typeof fetch = fetch
  ) {}
  private async token() {
    if (this.access && this.access.expires > Date.now()) {
      return this.access.token
    }
    const token = await requestToken(
      this.credentials,
      "refreshToken" in this.credentials
        ? { grant_type: "refresh_token", refresh_token: this.credentials.refreshToken, scope: ebayScopes.join(" ") }
        : { grant_type: "client_credentials", scope: appScope },
      this.transport
    )
    this.access = { token: token.access_token, expires: Date.now() + (token.expires_in - 60) * 1000 }
    return token.access_token
  }
  // A request to one of eBay's REST APIs, by its path on api.ebay.com or a full URL (the Identity API is on apiz).
  async request(method: string, path: string, body?: unknown) {
    const response = await this.transport(path.startsWith("https://") ? path : `${api}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await this.token()}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) {
      const reasons = errors.safeParse(await response.json().catch(() => null))
      const reason = reasons.success
        ? `: ${reasons.data.errors
            .map((error) => [error.errorId, error.longMessage ?? error.message].filter(Boolean).join(" ").slice(0, 300))
            .join("; ")}`
        : ""
      const retryAfter = Number(response.headers.get("retry-after"))
      throw new ProviderError(
        response.status,
        response.headers.get("x-ebay-c-request-id"),
        `eBay request failed (${response.status})${reason}`,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null
      )
    }
    if (response.status === 204 || response.status === 201) {
      return { location: response.headers.get("location") }
    }
    return response.json() as Promise<unknown>
  }
  // The signed-in seller's immutable user ID and their current username.
  async user() {
    return z
      .object({ userId: z.string().min(1), username: z.string().min(1) })
      .parse(await this.request("GET", "https://apiz.ebay.com/commerce/identity/v1/user/"))
  }
  // The key eBay signed a notification with, by the ID in its X-EBAY-SIGNATURE header. Needs the app's token.
  async publicKey(keyId: string) {
    return publicKey.parse(
      await this.request("GET", `/commerce/notification/v1/public_key/${encodeURIComponent(keyId)}`)
    )
  }
  async destinations() {
    const page = z
      .object({ destinations: z.array(destination).max(100).optional() })
      .parse(await this.request("GET", "/commerce/notification/v1/destination?limit=100"))
    return page.destinations ?? []
  }
  async createDestination(name: string, endpoint: string, verificationToken: string) {
    const created = await this.request("POST", "/commerce/notification/v1/destination", {
      name,
      status: "ENABLED",
      deliveryConfig: { endpoint, verificationToken }
    })
    const id = z.object({ location: z.string() }).parse(created).location.split("/").at(-1)
    return z.string().min(1).parse(id)
  }
  async updateDestination(destinationId: string, name: string, endpoint: string, verificationToken: string) {
    await this.request("PUT", `/commerce/notification/v1/destination/${encodeURIComponent(destinationId)}`, {
      name,
      status: "ENABLED",
      deliveryConfig: { endpoint, verificationToken }
    })
  }
  async subscriptions() {
    const page = z
      .object({ subscriptions: z.array(subscription).max(100).optional() })
      .parse(await this.request("GET", "/commerce/notification/v1/subscription?limit=100"))
    return page.subscriptions ?? []
  }
  async subscribe(topicId: string, destinationId: string) {
    await this.request("POST", "/commerce/notification/v1/subscription", {
      topicId,
      destinationId,
      status: "ENABLED",
      payload: { format: "JSON", schemaVersion: "1.0", deliveryProtocol: "HTTPS" }
    })
  }
  async enableSubscription(subscriptionId: string) {
    await this.request("POST", `/commerce/notification/v1/subscription/${encodeURIComponent(subscriptionId)}/enable`)
  }
}

// eBay signs each notification with an ECDSA key it names in the X-EBAY-SIGNATURE header: base64 JSON holding the key
// ID and the signature over the message body.
export const ebaySignatureHeader = z
  .string()
  .max(4096)
  .transform((value, context) => {
    try {
      return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as unknown
    } catch {
      context.addIssue({ code: "custom", message: "Not an eBay signature" })
      return z.NEVER
    }
  })
  .pipe(z.object({ alg: z.string().optional(), kid: z.string().min(1).max(200), signature: z.string().min(1) }))

// eBay hands the key over as PEM without line breaks.
function pem(key: string) {
  const body = key
    .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "")
    .match(/.{1,64}/g)
    ?.join("\n")
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`
}

// Whether the body is what eBay signed. eBay's own SDKs check the signature over the JSON as written again, so a body
// formatted differently in transit still verifies.
export function verifyEbaySignature(body: string, signature: string, key: string) {
  const publicKeyObject = createPublicKey(pem(key))
  const candidates = [body]
  try {
    candidates.push(JSON.stringify(JSON.parse(body)))
  } catch {
    return false
  }
  return candidates.some((candidate) =>
    createVerify("sha1").update(candidate).verify(publicKeyObject, Buffer.from(signature, "base64"))
  )
}
