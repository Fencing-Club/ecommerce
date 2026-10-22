import { Amazon, sellerIdSchema } from "@repo/copacker-marketplaces/amazon"
import { amazonMarketplace } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { Ebay } from "@repo/copacker-marketplaces/ebay"
import { Shopify, ShopifyRequestError } from "@repo/copacker-marketplaces/shopify"
import { refreshShopifyToken, revokeShopifyToken } from "@repo/copacker-marketplaces/shopify-auth"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { AccessError } from "@/i18n/errors"
import { selfAuthorizationSchema } from "@/lib/amazon"
import type { Store } from "@/lib/stores"
import { amazonReportPolicy } from "./amazon-report-policy"
import { DemoShopify, demoShopConnection } from "./demo-shopify"
import { ReconnectRequiredError } from "./errors"
import { requireConnectedAccount } from "./provider-accounts"
import { decrypt, encrypt } from "./security"

// Copacker's Shopify app's keys.
export function shopifyApp() {
  return { clientId: process.env.SHOPIFY_CLIENT_ID ?? "", clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? "" }
}
const savedToken = z.object({
  token: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  refreshExpiresAt: z.number().optional()
})
type Account = typeof connections.$inferSelect

const readToken = (account: Account) =>
  savedToken.parse(JSON.parse(decrypt(account.encryptedToken, `${account.orgId}:${account.provider}`)))

// Shopify's access tokens expire; renew one that has less than a minute left. The demo store's never does.
const shopifyTokenExpiring = (account: Account, stored: z.infer<typeof savedToken>) =>
  !demoShopConnection(account.externalId, stored.token) && (!stored.expiresAt || stored.expiresAt < Date.now() + 60000)

// The connected account and its access token. Only renewing a Shopify token locks the row, so concurrent jobs renew
// it once: one that waited for the lock finds the token already renewed.
export async function connection(orgId: string, provider: Store) {
  const account = await requireConnectedAccount(orgId, provider)
  const stored = readToken(account)
  if (provider === "shopify" && shopifyTokenExpiring(account, stored)) {
    return renewShopifyToken(orgId)
  }
  // An eBay refresh token lasts about 18 months; after that only signing in again renews it.
  if (provider === "ebay" && stored.refreshExpiresAt && stored.refreshExpiresAt < Date.now()) {
    throw new ReconnectRequiredError("Reconnect eBay to renew seller authorization")
  }
  return { ...account, token: stored.token }
}

async function renewShopifyToken(orgId: string) {
  return db().transaction(async (tx) => {
    const account = await requireConnectedAccount(orgId, "shopify", { executor: tx, lock: "update" })
    let stored = readToken(account)
    if (shopifyTokenExpiring(account, stored)) {
      if (!stored.refreshToken || !stored.refreshExpiresAt || stored.refreshExpiresAt < Date.now()) {
        throw new ReconnectRequiredError("Reconnect Shopify to renew merchant authorization")
      }
      try {
        stored = await refreshShopifyToken(shopifyApp(), account.externalId, stored.refreshToken)
      } catch (error) {
        if (error instanceof ShopifyRequestError) {
          throw new ReconnectRequiredError(`Shopify token renewal failed (${error.status}). Reconnect in Settings`)
        }
        throw error
      }
      await tx
        .update(connections)
        .set({ encryptedToken: encrypt(JSON.stringify(stored), `${orgId}:shopify`) })
        .where(eq(connections.id, account.id))
    }
    return { ...account, token: stored.token }
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
  return new Amazon(
    {
      clientId: process.env.AMAZON_CLIENT_ID,
      clientSecret: process.env.AMAZON_CLIENT_SECRET,
      refreshToken: c.token
    },
    undefined,
    amazonReportPolicy(c.externalId, process.env.AMAZON_CLIENT_ID)
  )
}
// Copacker's Amazon Ads app, separate from its SP-API app. Null when not configured.
export function amazonAdsApp() {
  const { AMAZON_ADS_CLIENT_ID, AMAZON_ADS_CLIENT_SECRET } = process.env
  return AMAZON_ADS_CLIENT_ID && AMAZON_ADS_CLIENT_SECRET
    ? { clientId: AMAZON_ADS_CLIENT_ID, clientSecret: AMAZON_ADS_CLIENT_SECRET }
    : null
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
export async function disconnect(orgId: string, provider: Store) {
  let revoked = false
  if (provider === "shopify") {
    try {
      const c = await connection(orgId, "shopify")
      if (!demoShopConnection(c.externalId, c.token)) {
        revoked = await revokeShopifyToken(c.externalId, c.token)
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
  const sellerId = sellerIdSchema.safeParse(process.env.AMAZON_MERCHANT_TOKEN?.trim())
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
  if (
    !account.success ||
    !account.data.payload.some((entry) => entry.marketplace.id === amazonMarketplace(input.marketplace).id)
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
