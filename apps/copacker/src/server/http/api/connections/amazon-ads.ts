import { adsScope, adsToken, AmazonAds } from "@repo/copacker-marketplaces/amazon-ads"
import { and, eq, gt } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, oauthStates } from "@/db/schema"
import { adsStatus, disconnectAds, queueAdsSync, saveAdsConnection } from "@/server/amazon-ads"
import { adsOAuthCallback, relayAdsOAuth, startAdsOAuth } from "@/server/amazon-ads-oauth"
import { session } from "@/server/auth"
import { requireAdmin, requireBuyer } from "@/server/authorization"
import { amazonAdsApp } from "@/server/connections"
import { errorResponse } from "@/server/errors"
import { hash, isAppOrigin, siteUrlFor } from "@/server/security"

export async function GET(request: Request) {
  const site = siteUrlFor(request.headers)
  try {
    const relayed = relayAdsOAuth(request, site)
    if (relayed) {
      return relayed
    }
  } catch {
    return errorResponse("connectionExpired", 400)
  }
  const s = await session()
  requireBuyer(s)
  const url = new URL(request.url)
  if (url.searchParams.has("status")) {
    return Response.json(await adsStatus(s.org.id), { headers: { "Cache-Control": "private, no-store" } })
  }
  requireAdmin(s)
  const settings = `${site}/settings#integrations`
  const app = amazonAdsApp()
  if (!app) {
    return errorResponse("amazonConnectionFailed", 503)
  }
  const [seller] = await db()
    .select({ externalId: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "amazon")))
  if (!seller) {
    return errorResponse("amazonConnectionFailed", 409)
  }
  if (!url.searchParams.has("state")) {
    if (url.searchParams.has("code") || url.searchParams.has("error")) {
      return errorResponse("connectionExpired", 400)
    }
    let authorization
    try {
      authorization = startAdsOAuth(site)
    } catch {
      return errorResponse("amazonConnectionFailed", 503)
    }
    const { state, callback } = authorization
    await db()
      .insert(oauthStates)
      .values({
        hash: hash(state),
        orgId: s.org.id,
        userId: s.user.id,
        provider: "amazon-ads",
        shop: seller.externalId,
        expiresAt: new Date(Date.now() + 10 * 60000)
      })
    const target = new URL("https://www.amazon.com/ap/oa")
    target.search = new URLSearchParams({
      client_id: app.clientId,
      response_type: "code",
      scope: adsScope,
      redirect_uri: callback,
      state
    }).toString()
    return Response.redirect(target)
  }
  let callback
  try {
    callback = adsOAuthCallback(site, url.searchParams.get("state") ?? "")
  } catch {
    return errorResponse("connectionExpired", 400)
  }
  // Consumed atomically and bound to both the workspace and the person who started consent.
  const [state] = await db()
    .delete(oauthStates)
    .where(
      and(
        eq(oauthStates.hash, hash(url.searchParams.get("state") ?? "")),
        eq(oauthStates.orgId, s.org.id),
        eq(oauthStates.userId, s.user.id),
        eq(oauthStates.provider, "amazon-ads"),
        gt(oauthStates.expiresAt, new Date())
      )
    )
    .returning()
  if (!state || state.shop !== seller.externalId) {
    return errorResponse("connectionExpired", 400)
  }
  if (url.searchParams.has("error")) {
    return Response.redirect(settings)
  }
  try {
    const result = await adsToken(app, {
      grant_type: "authorization_code",
      code: z.string().min(1).parse(url.searchParams.get("code")),
      redirect_uri: callback
    })
    if (!result.refresh_token) {
      return errorResponse("amazonConnectionFailed", 400)
    }
    await saveAdsConnection(s.org.id, seller.externalId, result.refresh_token, new AmazonAds(app, result.access_token))
    await queueAdsSync(s.org.id)
  } catch {
    return errorResponse("amazonConnectionFailed", 400)
  }
  return Response.redirect(settings)
}
export async function POST(request: Request) {
  const s = await session()
  requireBuyer(s)
  requireAdmin(s)
  if (!isAppOrigin(request.headers.get("origin"))) {
    return new Response(null, { status: 403 })
  }
  const { action } = z.object({ action: z.enum(["sync", "disconnect"]) }).parse(await request.json())
  if (action === "disconnect") {
    await disconnectAds(s.org.id)
  } else {
    await queueAdsSync(s.org.id)
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } })
}
