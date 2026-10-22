import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { shopDomainSchema, ShopifyRequestError } from "./shopify"

// Shopify's OAuth: the code exchange, token refresh and uninstall, and the callback signature check. Server-only,
// unlike ./shopify, which the browser also loads for the shop-domain schema.
export type ShopifyAppCredentials = { clientId: string; clientSecret: string }

const shopifyTokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().positive(),
  refresh_token_expires_in: z.number().positive(),
  scope: z.string().optional()
})
// An expiring offline token as Copacker stores it, with both expiries as epoch milliseconds.
export type ShopifyToken = { token: string; refreshToken: string; expiresAt: number; refreshExpiresAt: number }
function storedToken(response: z.infer<typeof shopifyTokenResponse>): ShopifyToken {
  return {
    token: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    refreshExpiresAt: Date.now() + response.refresh_token_expires_in * 1000
  }
}

// The access scopes Shopify granted a token, from the comma- or space-separated list it returns with it.
export function grantedScopes(scopes: string) {
  return new Set(scopes.split(/[,\s]+/).filter(Boolean))
}
// How many days of orders Shopify shares without the read_all_orders scope.
export const recentOrderDays = 60

// Trades the code Shopify returns after the merchant approves the app for an expiring offline token and its scopes.
export async function exchangeShopifyCode(
  credentials: ShopifyAppCredentials,
  shop: string,
  code: string,
  transport: typeof fetch = fetch
) {
  const response = await transport(`https://${shopDomainSchema.parse(shop)}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      expiring: 1,
      code
    }),
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    throw new ShopifyRequestError(response.status)
  }
  const result = shopifyTokenResponse.parse(await response.json())
  return { token: storedToken(result), scope: result.scope ?? "" }
}

// Renews an expiring offline token with its refresh token.
export async function refreshShopifyToken(
  credentials: ShopifyAppCredentials,
  shop: string,
  refreshToken: string,
  transport: typeof fetch = fetch
) {
  const response = await transport(`https://${shopDomainSchema.parse(shop)}/admin/oauth/access_token`, {
    method: "POST",
    // Shopify only accepts the refresh grant form-encoded; a JSON body is rejected as invalid_request.
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret
    }),
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    throw new ShopifyRequestError(response.status)
  }
  return storedToken(shopifyTokenResponse.parse(await response.json()))
}

// Uninstalls the app from the shop, which revokes the token. Returns whether Shopify confirmed it.
export async function revokeShopifyToken(shop: string, token: string, transport: typeof fetch = fetch) {
  const response = await transport(`https://${shopDomainSchema.parse(shop)}/admin/api_permissions/current.json`, {
    method: "DELETE",
    headers: { "X-Shopify-Access-Token": token },
    signal: AbortSignal.timeout(30000)
  })
  return response.ok
}

// Whether an OAuth redirect's query string is what Shopify signed with the app's client secret.
export function verifyShopifyHmac(params: URLSearchParams, secret: string) {
  const provided = params.get("hmac") ?? ""
  if (!/^[a-f0-9]{64}$/.test(provided)) {
    return false
  }
  const entries = [...params]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
  const message = entries.map(([key, value]) => `${key}=${value}`).join("&")
  return timingSafeEqual(Buffer.from(provided, "hex"), createHmac("sha256", secret).update(message).digest())
}
