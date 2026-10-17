import { Amazon } from "@repo/aisle/amazon"
import { Ebay } from "@repo/aisle/ebay"
import { Shopify } from "@repo/aisle/shopify"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { AccessError } from "@/i18n/errors"
import { selfAuthorizationSchema } from "@/lib/amazon"
import { DemoShopify, demoShopConnection } from "./demo-shopify"
import { ReconnectRequiredError } from "./errors"
import { decrypt, encrypt } from "./security"

export const shopifyTokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().positive(),
  refresh_token_expires_in: z.number().positive(),
  scope: z.string().optional()
})
export function storedShopifyToken(response: z.infer<typeof shopifyTokenResponse>) {
  return {
    token: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    refreshExpiresAt: Date.now() + response.refresh_token_expires_in * 1000
  }
}
const savedToken = z.object({
  token: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  refreshExpiresAt: z.number().optional()
})

export type Provider = "amazon" | "shopify" | "ebay"

export async function connection(orgId: string, provider: Provider) {
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.provider, provider)))
      .for("update")
    if (!row) {
      throw new LocalizedError("connectInSettings", { provider })
    }
    let stored = savedToken.parse(JSON.parse(decrypt(row.encryptedToken, `${orgId}:${provider}`)))
    const demo = provider === "shopify" && demoShopConnection(row.externalId, stored.token)
    if (provider === "shopify" && !demo && (!stored.expiresAt || stored.expiresAt < Date.now() + 60000)) {
      if (!stored.refreshToken || !stored.refreshExpiresAt || stored.refreshExpiresAt < Date.now()) {
        throw new ReconnectRequiredError("Reconnect Shopify to renew merchant authorization")
      }
      const response = await fetch(`https://${row.externalId}/admin/oauth/access_token`, {
        method: "POST",
        // Shopify only accepts the refresh grant form-encoded; a JSON body is rejected as invalid_request.
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: stored.refreshToken,
          client_id: process.env.SHOPIFY_CLIENT_ID ?? "",
          client_secret: process.env.SHOPIFY_CLIENT_SECRET ?? ""
        }),
        signal: AbortSignal.timeout(30000)
      })
      if (!response.ok) {
        throw new ReconnectRequiredError(`Shopify token renewal failed (${response.status}). Reconnect in Settings`)
      }
      stored = storedShopifyToken(shopifyTokenResponse.parse(await response.json()))
      await tx
        .update(connections)
        .set({ encryptedToken: encrypt(JSON.stringify(stored), `${orgId}:${provider}`) })
        .where(eq(connections.id, row.id))
    }
    // An eBay refresh token lasts about 18 months; after that only signing in again renews it.
    if (provider === "ebay" && stored.refreshExpiresAt && stored.refreshExpiresAt < Date.now()) {
      throw new ReconnectRequiredError("Reconnect eBay to renew seller authorization")
    }
    return { ...row, token: stored.token }
  })
}
export async function shopifyFor(orgId: string, expectedDomain?: string) {
  const c = await connection(orgId, "shopify")
  if (expectedDomain && c.externalId !== expectedDomain) {
    throw new LocalizedError("reconnectOrderShopify")
  }
  return demoShopConnection(c.externalId, c.token) ? new DemoShopify(orgId) : new Shopify(c.externalId, c.token)
}
export async function amazonFor(orgId: string, expectedSellerId?: string | null) {
  const c = await connection(orgId, "amazon")
  if (expectedSellerId && c.externalId !== expectedSellerId) {
    throw new LocalizedError("reconnectOrderAmazon")
  }
  if (!process.env.AMAZON_CLIENT_ID || !process.env.AMAZON_CLIENT_SECRET) {
    throw new Error("Amazon developer credentials are not configured")
  }
  return new Amazon({
    clientId: process.env.AMAZON_CLIENT_ID,
    clientSecret: process.env.AMAZON_CLIENT_SECRET,
    refreshToken: c.token
  })
}
// Copacker's eBay app: its keys and the redirect URL name (RuName) sign-in returns through. Null when not configured.
export function ebayApp() {
  const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RU_NAME } = process.env
  return EBAY_CLIENT_ID && EBAY_CLIENT_SECRET && EBAY_RU_NAME
    ? { clientId: EBAY_CLIENT_ID, clientSecret: EBAY_CLIENT_SECRET, ruName: EBAY_RU_NAME }
    : null
}
export async function ebayFor(orgId: string, expectedUserId?: string) {
  const c = await connection(orgId, "ebay")
  if (expectedUserId && c.externalId !== expectedUserId) {
    throw new LocalizedError("reconnectEbay")
  }
  const app = ebayApp()
  if (!app) {
    throw new Error("eBay developer credentials are not configured")
  }
  return new Ebay({ clientId: app.clientId, clientSecret: app.clientSecret, refreshToken: c.token })
}
// Copacker's own Amazon app, for grantless operations such as managing notification destinations.
export function amazonApp(scope: string) {
  if (!process.env.AMAZON_CLIENT_ID || !process.env.AMAZON_CLIENT_SECRET) {
    throw new Error("Amazon developer credentials are not configured")
  }
  return new Amazon({
    clientId: process.env.AMAZON_CLIENT_ID,
    clientSecret: process.env.AMAZON_CLIENT_SECRET,
    grantlessScope: scope
  })
}
// Returns whether the provider confirmed the revocation. Local credentials are always removed.
export async function disconnect(orgId: string, provider: Provider) {
  let revoked = false
  if (provider === "shopify") {
    try {
      const c = await connection(orgId, "shopify")
      if (!demoShopConnection(c.externalId, c.token)) {
        const response = await fetch(`https://${c.externalId}/admin/api_permissions/current.json`, {
          method: "DELETE",
          headers: { "X-Shopify-Access-Token": c.token },
          signal: AbortSignal.timeout(30000)
        })
        revoked = response.ok
      }
    } catch {
      revoked = false
    }
  }
  const removed = await db()
    .delete(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, provider)))
    .returning({ id: connections.id })
  if (!removed.length) {
    throw new LocalizedError("alreadyDisconnected", { provider })
  }
  return { revoked }
}

// Administrative self-authorization for private developer apps. The customer-facing flow uses Seller Central OAuth,
// including for draft public apps. The token is checked with Amazon before it is saved.
export function amazonSelfAuthEnabled() {
  return process.env.AMAZON_SELF_AUTH_ENABLED !== "false"
}

export async function connectAmazonSelfAuthorized(orgId: string, raw: unknown) {
  if (!amazonSelfAuthEnabled()) {
    throw new AccessError("forbidden")
  }
  const input = selfAuthorizationSchema.parse(raw)
  const sellerId = z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{8,32}$/)
    .safeParse(process.env.AMAZON_MERCHANT_TOKEN)
  if (!sellerId.success) {
    throw new LocalizedError("requestFailed")
  }
  if (!process.env.AMAZON_CLIENT_ID || !process.env.AMAZON_CLIENT_SECRET) {
    throw new Error("Amazon developer credentials are not configured")
  }
  const amazon = new Amazon({
    clientId: process.env.AMAZON_CLIENT_ID,
    clientSecret: process.env.AMAZON_CLIENT_SECRET,
    refreshToken: input.refreshToken
  })
  let participations: unknown
  try {
    participations = await amazon.request("GET", "/sellers/v1/marketplaceParticipations")
  } catch {
    throw new LocalizedError("amazonTokenRejected")
  }
  const account = z
    .object({ payload: z.array(z.object({ marketplace: z.object({ id: z.string() }) })) })
    .safeParse(participations)
  const marketplaceIds = { US: "ATVPDKIKX0DER", CA: "A2EUQ1WTGCTBG2", MX: "A1AM78C64UM0Y8", BR: "A2Q3Y263D00KWC" }
  if (
    !account.success ||
    !account.data.payload.some((entry) => entry.marketplace.id === marketplaceIds[input.marketplace])
  ) {
    throw new LocalizedError("amazonTokenRejected")
  }
  const encryptedToken = encrypt(JSON.stringify({ token: input.refreshToken }), `${orgId}:amazon`)
  await db()
    .insert(connections)
    .values({ orgId, provider: "amazon", externalId: sellerId.data, encryptedToken })
    .onConflictDoUpdate({
      target: [connections.orgId, connections.provider],
      set: { externalId: sellerId.data, encryptedToken, scopes: "" }
    })
  return { sellerId: sellerId.data }
}
