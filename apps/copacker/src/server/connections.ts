import { Amazon } from "@repo/aisle/amazon"
import { Shopify } from "@repo/aisle/shopify"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections } from "@/db/schema"
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

export async function connection(orgId: string, provider: "amazon" | "shopify") {
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.provider, provider)))
      .for("update")
    if (!row) {
      throw new Error(`Connect ${provider === "amazon" ? "Amazon" : "Shopify"} in Settings first`)
    }
    let stored = savedToken.parse(JSON.parse(decrypt(row.encryptedToken, `${orgId}:${provider}`)))
    if (provider === "shopify" && (!stored.expiresAt || stored.expiresAt < Date.now() + 60000)) {
      if (!stored.refreshToken || !stored.refreshExpiresAt || stored.refreshExpiresAt < Date.now()) {
        throw new Error("Reconnect Shopify to renew merchant authorization")
      }
      const response = await fetch(`https://${row.externalId}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: stored.refreshToken,
          client_id: process.env.SHOPIFY_CLIENT_ID,
          client_secret: process.env.SHOPIFY_CLIENT_SECRET
        }),
        signal: AbortSignal.timeout(30000)
      })
      if (!response.ok) {
        throw new Error("Shopify token renewal failed. Reconnect in Settings")
      }
      stored = storedShopifyToken(shopifyTokenResponse.parse(await response.json()))
      await tx
        .update(connections)
        .set({ encryptedToken: encrypt(JSON.stringify(stored), `${orgId}:${provider}`) })
        .where(eq(connections.id, row.id))
    }
    return { ...row, token: stored.token }
  })
}
export async function shopifyFor(orgId: string, expectedDomain?: string) {
  const c = await connection(orgId, "shopify")
  if (expectedDomain && c.externalId !== expectedDomain) {
    throw new Error("Reconnect the Shopify store originally selected for this PO")
  }
  return new Shopify(c.externalId, c.token)
}
export async function amazonFor(orgId: string, expectedSellerId?: string) {
  const c = await connection(orgId, "amazon")
  if (expectedSellerId && c.externalId !== expectedSellerId) {
    throw new Error("Reconnect the Amazon account originally selected for this PO")
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
// Returns whether the provider confirmed the revocation. Local credentials are always removed.
export async function disconnect(orgId: string, provider: "amazon" | "shopify") {
  let revoked = false
  if (provider === "shopify") {
    try {
      const c = await connection(orgId, "shopify")
      const response = await fetch(`https://${c.externalId}/admin/api_permissions/current.json`, {
        method: "DELETE",
        headers: { "X-Shopify-Access-Token": c.token },
        signal: AbortSignal.timeout(30000)
      })
      revoked = response.ok
    } catch {
      revoked = false
    }
  }
  const removed = await db()
    .delete(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, provider)))
    .returning({ id: connections.id })
  if (!removed.length) {
    throw new Error(`${provider === "amazon" ? "Amazon" : "Shopify"} is already disconnected`)
  }
  return { revoked }
}
