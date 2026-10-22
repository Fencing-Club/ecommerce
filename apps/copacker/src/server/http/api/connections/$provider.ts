import { randomUUID } from "node:crypto"
import { exchangeAmazonCode, ProviderError, sellerIdSchema } from "@repo/copacker-marketplaces/amazon"
import { amazonConsentUrl, amazonMarketplaceSchema } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { Ebay, ebayAuthorizeUrl, exchangeEbayCode } from "@repo/copacker-marketplaces/ebay"
import { normalizeShopDomain, shopDomainSchema, ShopifyRequestError } from "@repo/copacker-marketplaces/shopify"
import { exchangeShopifyCode, verifyShopifyHmac } from "@repo/copacker-marketplaces/shopify-auth"
import { and, eq, gt } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, oauthStates } from "@/db/schema"
import { stores } from "@/lib/stores"
import { queueAmazonSubscription } from "@/server/amazon-notifications"
import { session } from "@/server/auth"
import { requireAdmin, requireBuyer } from "@/server/authorization"
import { ebayApp, shopifyApp } from "@/server/connections"
import { queueEbaySubscription } from "@/server/ebay-events"
import { errorResponse, requestInput } from "@/server/errors"
import { startFirstSync } from "@/server/first-sync"
import { siteUrlFor, token, hash, encrypt } from "@/server/security"
import { queueShopifySubscription } from "@/server/shopify-webhooks"

export async function GET(request: Request, context: { params: { provider: string } }) {
  const s = await session()
  requireAdmin(s)
  requireBuyer(s)
  const provider = requestInput(z.enum(stores), context.params.provider)
  const url = new URL(request.url),
    isCallback = url.searchParams.has("state")
  const site = siteUrlFor(request.headers)
  const callback = `${site}/api/connections/${provider}`
  if (!isCallback) {
    const state = token(),
      shop =
        provider === "shopify"
          ? requestInput(shopDomainSchema, normalizeShopDomain(url.searchParams.get("shop") ?? ""))
          : null
    let target: URL
    if (provider === "shopify") {
      if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) {
        return Response.json({ error: "Shopify developer app is not configured" }, { status: 503 })
      }
      target = new URL(`https://${shop}/admin/oauth/authorize`)
      target.search = new URLSearchParams({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        scope:
          "read_products,write_products,read_inventory,write_inventory,read_locations,read_orders,read_all_orders,read_shopify_payments_accounts,read_shopify_payments_payouts,read_customers,read_fulfillments,read_returns",
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
    let result: Awaited<ReturnType<typeof exchangeShopifyCode>>
    try {
      result = await exchangeShopifyCode(
        shopifyApp(),
        externalId,
        requestInput(z.string().min(1), url.searchParams.get("code"))
      )
    } catch (error) {
      if (error instanceof ShopifyRequestError) {
        return errorResponse("shopifyConnectionFailed", 400)
      }
      throw error
    }
    credential = result.token
    scopes = result.scope
  } else if (provider === "ebay") {
    const app = ebayApp()
    if (!app) {
      return Response.json({ error: "eBay developer app is not configured" }, { status: 503 })
    }
    let token: Awaited<ReturnType<typeof exchangeEbayCode>>
    try {
      token = await exchangeEbayCode(app, app.ruName, requestInput(z.string().min(1), url.searchParams.get("code")))
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
    externalId = requestInput(sellerIdSchema, url.searchParams.get("selling_partner_id"))
    const code = requestInput(z.string().min(1), url.searchParams.get("spapi_oauth_code"))
    let refreshToken: string
    try {
      refreshToken = await exchangeAmazonCode(
        { clientId: process.env.AMAZON_CLIENT_ID!, clientSecret: process.env.AMAZON_CLIENT_SECRET! },
        code,
        callback
      )
    } catch (error) {
      if (error instanceof ProviderError) {
        return errorResponse("amazonConnectionFailed", 400)
      }
      throw error
    }
    credential = { token: refreshToken }
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
