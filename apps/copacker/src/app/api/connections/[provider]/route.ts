import { randomUUID } from "node:crypto"
import { Ebay, ebayAuthorizeUrl, exchangeEbayCode } from "@repo/aisle/ebay"
import { normalizeShopDomain, shopDomainSchema } from "@repo/aisle/shopify"
import { and, eq, gt } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, oauthStates } from "@/db/schema"
import { amazonConsentUrl, amazonMarketplaceSchema } from "@/lib/amazon-marketplaces"
import { queueAmazonSubscription } from "@/server/amazon-notifications"
import { session, requireAdmin, requireBuyer } from "@/server/auth"
import { ebayApp, shopifyTokenResponse, storedShopifyToken } from "@/server/connections"
import { queueEbaySubscription } from "@/server/ebay-events"
import { errorResponse } from "@/server/errors"
import { startFirstSync } from "@/server/first-sync"
import { siteUrlFor, token, hash, encrypt, verifyShopifyHmac } from "@/server/security"
import { queueShopifySubscription } from "@/server/shopify-webhooks"

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const s = await session()
  requireAdmin(s)
  requireBuyer(s)
  const provider = z.enum(["shopify", "amazon", "ebay"]).parse((await context.params).provider)
  const url = new URL(request.url),
    isCallback = url.searchParams.has("state")
  const site = siteUrlFor(request.headers)
  const callback = `${site}/api/connections/${provider}`
  if (!isCallback) {
    const state = token(),
      shop =
        provider === "shopify" ? shopDomainSchema.parse(normalizeShopDomain(url.searchParams.get("shop") ?? "")) : null
    let target: URL
    if (provider === "shopify") {
      if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) {
        return Response.json({ error: "Shopify developer app is not configured" }, { status: 503 })
      }
      target = new URL(`https://${shop}/admin/oauth/authorize`)
      target.search = new URLSearchParams({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        scope:
          "read_products,write_products,read_inventory,write_inventory,read_locations,read_orders,read_all_orders,read_shopify_payments_accounts,read_shopify_payments_payouts,read_customers,read_fulfillments",
        redirect_uri: callback,
        state
      }).toString()
    } else if (provider === "ebay") {
      const app = ebayApp()
      if (!app) {
        return Response.json({ error: "eBay developer app is not configured" }, { status: 503 })
      }
      // eBay returns to the accepted URL set on the redirect URL name (RuName), which points here.
      target = ebayAuthorizeUrl(app.clientId, app.ruName, state)
    } else {
      if (!process.env.AMAZON_APPLICATION_ID || !process.env.AMAZON_CLIENT_ID || !process.env.AMAZON_CLIENT_SECRET) {
        return Response.json({ error: "Amazon developer app is not configured" }, { status: 503 })
      }
      const marketplace = amazonMarketplaceSchema.safeParse(url.searchParams.get("marketplace") ?? "US")
      if (!marketplace.success) {
        return Response.json({ error: "Unsupported Amazon marketplace" }, { status: 400 })
      }
      target = amazonConsentUrl({
        marketplace: marketplace.data,
        applicationId: process.env.AMAZON_APPLICATION_ID,
        state,
        callback,
        draft: process.env.AMAZON_APP_DRAFT === "true"
      })
    }
    await db()
      .insert(oauthStates)
      .values({
        hash: hash(state),
        orgId: s.org.id,
        userId: s.user.id,
        provider,
        shop,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      })
    return Response.redirect(target)
  }
  const stateHash = hash(url.searchParams.get("state") ?? "")
  const [state] = await db()
    .select()
    .from(oauthStates)
    .where(
      and(
        eq(oauthStates.hash, stateHash),
        eq(oauthStates.orgId, s.org.id),
        eq(oauthStates.userId, s.user.id),
        eq(oauthStates.provider, provider),
        gt(oauthStates.expiresAt, new Date())
      )
    )
  if (!state) {
    return errorResponse("connectionExpired", 400)
  }
  if (
    provider === "shopify" &&
    (!verifyShopifyHmac(url.searchParams, process.env.SHOPIFY_CLIENT_SECRET ?? "") ||
      url.searchParams.get("shop") !== state.shop)
  ) {
    return errorResponse("invalidShopifyCallback", 400)
  }
  const consumed = await db().delete(oauthStates).where(eq(oauthStates.hash, stateHash)).returning()
  if (consumed.length !== 1) {
    return errorResponse("connectionAlreadyUsed", 400)
  }
  let externalId: string,
    credential: { token: string; refreshToken?: string; expiresAt?: number; refreshExpiresAt?: number },
    scopes = ""
  if (provider === "shopify") {
    externalId = shopDomainSchema.parse(state.shop)
    const response = await fetch(`https://${externalId}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        expiring: 1,
        code: z.string().min(1).parse(url.searchParams.get("code"))
      }),
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) {
      return errorResponse("shopifyConnectionFailed", 400)
    }
    const result = shopifyTokenResponse.parse(await response.json())
    credential = storedShopifyToken(result)
    scopes = result.scope ?? ""
  } else if (provider === "ebay") {
    const app = ebayApp()
    if (!app) {
      return Response.json({ error: "eBay developer app is not configured" }, { status: 503 })
    }
    let token: Awaited<ReturnType<typeof exchangeEbayCode>>
    try {
      token = await exchangeEbayCode(app, app.ruName, z.string().min(1).parse(url.searchParams.get("code")))
      // The seller's immutable user ID identifies the account; their username can change.
      externalId = (await new Ebay({ ...app, refreshToken: token.refreshToken }).user()).userId
    } catch {
      return errorResponse("ebayConnectionFailed", 400)
    }
    credential = {
      token: token.refreshToken,
      ...(token.refreshTokenExpiresAt ? { refreshExpiresAt: token.refreshTokenExpiresAt.getTime() } : {})
    }
  } else {
    externalId = z
      .string()
      .regex(/^[A-Z0-9]{8,32}$/)
      .parse(url.searchParams.get("selling_partner_id"))
    const response = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: z.string().min(1).parse(url.searchParams.get("spapi_oauth_code")),
        client_id: process.env.AMAZON_CLIENT_ID!,
        client_secret: process.env.AMAZON_CLIENT_SECRET!,
        redirect_uri: callback
      }),
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) {
      return errorResponse("amazonConnectionFailed", 400)
    }
    credential = { token: z.object({ refresh_token: z.string() }).parse(await response.json()).refresh_token }
  }
  const encryptedToken = encrypt(JSON.stringify(credential), `${s.org.id}:${provider}`)
  await db()
    .insert(connections)
    .values({ id: randomUUID(), orgId: s.org.id, provider, externalId, encryptedToken, scopes })
    .onConflictDoUpdate({
      target: [connections.orgId, connections.provider],
      set: { externalId, encryptedToken, scopes }
    })
  if (provider === "shopify") {
    await queueShopifySubscription(s.org.id, randomUUID())
  } else if (provider === "ebay") {
    await queueEbaySubscription(s.org.id, randomUUID())
  } else {
    await queueAmazonSubscription(s.org.id, randomUUID())
  }
  await startFirstSync(s.org, provider)
  return Response.redirect(`${site}/settings?connected=${provider}#integrations`)
}
