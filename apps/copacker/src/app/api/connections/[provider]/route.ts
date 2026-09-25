import { randomUUID } from "node:crypto"
import { normalizeShopDomain, shopDomainSchema } from "@repo/aisle/shopify"
import { and, eq, gt } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, oauthStates } from "@/db/schema"
import { session, requireOwner, requireBuyer } from "@/server/auth"
import { shopifyTokenResponse, storedShopifyToken } from "@/server/connections"
import { appUrl, token, hash, encrypt, verifyShopifyHmac } from "@/server/security"

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const s = await session()
  requireOwner(s)
  requireBuyer(s)
  const provider = z.enum(["shopify", "amazon"]).parse((await context.params).provider)
  const url = new URL(request.url),
    isCallback = url.searchParams.has("state")
  const callback = `${appUrl()}/api/connections/${provider}`
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
        scope: "read_products,write_products,read_inventory,write_inventory,read_locations,read_orders,read_all_orders",
        redirect_uri: callback,
        state
      }).toString()
    } else {
      if (!process.env.AMAZON_APPLICATION_ID || !process.env.AMAZON_CLIENT_ID || !process.env.AMAZON_CLIENT_SECRET) {
        return Response.json({ error: "Amazon developer app is not configured" }, { status: 503 })
      }
      target = new URL("https://sellercentral.amazon.com/apps/authorize/consent")
      target.search = new URLSearchParams({
        application_id: process.env.AMAZON_APPLICATION_ID,
        state,
        redirect_uri: callback,
        // Amazon only authorizes a draft (unpublished) app when the consent link asks for its beta version.
        ...(process.env.AMAZON_APP_DRAFT === "true" ? { version: "beta" } : {})
      }).toString()
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
    return Response.json({ error: "Connection request expired. Start again from Settings" }, { status: 400 })
  }
  if (
    provider === "shopify" &&
    (!verifyShopifyHmac(url.searchParams, process.env.SHOPIFY_CLIENT_SECRET ?? "") ||
      url.searchParams.get("shop") !== state.shop)
  ) {
    return Response.json({ error: "Invalid Shopify callback" }, { status: 400 })
  }
  const consumed = await db().delete(oauthStates).where(eq(oauthStates.hash, stateHash)).returning()
  if (consumed.length !== 1) {
    return Response.json({ error: "Connection request already used" }, { status: 400 })
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
      return Response.json({ error: "Shopify connection failed. Start again" }, { status: 400 })
    }
    const result = shopifyTokenResponse.parse(await response.json())
    credential = storedShopifyToken(result)
    scopes = result.scope ?? ""
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
      return Response.json({ error: "Amazon connection failed. Start again" }, { status: 400 })
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
  return Response.redirect(`${appUrl()}/settings?connected=${provider}`)
}
