import { shopDomainSchema, ShopifyRequestError } from "@repo/aisle/shopify"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, jobs, organizations } from "@/db/schema"
import { disconnect, shopifyFor } from "./connections"
import { ReconnectRequiredError } from "./errors"
import { PollAgain } from "./job-handlers"
import { requestSalesSync, SalesSyncError } from "./sales-orders"
import { appUrl } from "./security"
import { refreshStock } from "./stock"

// What Shopify tells Copacker about. The events only say that something changed; the existing syncs read the changes.
export const shopifyWebhookTopics = [
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "ORDERS_DELETE",
  "INVENTORY_LEVELS_UPDATE",
  "APP_UNINSTALLED"
] as const
const eventTargets = new Map<string, "sales" | "stock" | "uninstalled">([
  ["orders/create", "sales"],
  ["orders/updated", "sales"],
  ["orders/cancelled", "sales"],
  ["orders/delete", "sales"],
  ["inventory_levels/update", "stock"],
  ["app/uninstalled", "uninstalled"]
])
// Events are gathered into five-minute periods and each period starts one sync, so a burst of orders reads Shopify
// once. The sync starts three minutes after its period ends, when the orders in it have settled (see syncChunks).
const batchMs = 5 * 60000
const settleMs = 3 * 60000

export function shopifyWebhookAddress() {
  return `${appUrl()}/api/webhooks/shopify`
}

// Queues the work a verified webhook calls for, for every workspace connected to the store. Returns how many were.
export async function receiveShopifyWebhook(topic: string, shop: string, now = Date.now()) {
  const target = eventTargets.get(topic)
  if (!target || !shopDomainSchema.safeParse(shop).success) {
    return 0
  }
  const accounts = await db()
    .select({ orgId: connections.orgId })
    .from(connections)
    .where(and(eq(connections.provider, "shopify"), eq(connections.externalId, shop)))
  if (!accounts.length) {
    return 0
  }
  const batch = Math.floor(now / batchMs)
  await db()
    .insert(jobs)
    .values(
      accounts.map(({ orgId }) => ({
        key: `shopify-event:${orgId}:${target}:${batch}`,
        kind: "shopify-event" as const,
        payload: { orgId, shop, target },
        runAt: new Date(target === "uninstalled" ? now : (batch + 1) * batchMs + settleMs)
      }))
    )
    .onConflictDoNothing()
  return accounts.length
}

const eventPayload = z.object({
  orgId: z.uuid(),
  shop: shopDomainSchema,
  target: z.enum(["sales", "stock", "uninstalled"])
})

// Worker job: starts the sync an event calls for, or removes the connection when the store uninstalled the app.
export async function shopifyEventJob(payload: Record<string, unknown>) {
  const { orgId, shop, target } = eventPayload.parse(payload)
  const [account] = await db()
    .select({ externalId: connections.externalId, kind: organizations.kind })
    .from(connections)
    .innerJoin(organizations, eq(organizations.id, connections.orgId))
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "shopify")))
  // The workspace disconnected or switched stores after the event arrived.
  if (!account || account.externalId !== shop) {
    return
  }
  if (target === "uninstalled") {
    // A store that reinstalls the app right away sends the uninstall late; its new authorization still works.
    if (!(await authorizationRevoked(orgId))) {
      return
    }
    await disconnect(orgId, "shopify")
    return
  }
  const org = { id: orgId, kind: account.kind }
  let started
  try {
    started =
      target === "sales" ? await requestSalesSync(org, "shopify") : await refreshStock(org, { source: "shopify" })
  } catch (error) {
    // The connection can't sync orders (missing access); Settings already asks the buyer to reconnect.
    if (error instanceof SalesSyncError) {
      return
    }
    throw error
  }
  // A running sync started before these events, so it may miss them; start another once it finishes.
  if (started?.status === "running") {
    throw new PollAgain("Waiting for the running Shopify sync to finish")
  }
}

async function authorizationRevoked(orgId: string) {
  try {
    await (await shopifyFor(orgId)).graphql("query Installed{shop{id}}")
    return false
  } catch (error) {
    if (
      error instanceof ReconnectRequiredError ||
      (error instanceof ShopifyRequestError && [401, 403].includes(error.status))
    ) {
      return true
    }
    throw error
  }
}

// Queues subscribing the workspace's store to Copacker's webhooks. Runs after connecting and daily, which also repairs
// subscriptions Shopify removed after failed deliveries.
export async function queueShopifySubscription(orgId: string, key: string) {
  await db()
    .insert(jobs)
    .values({ key: `shopify-subscribe:${orgId}:${key}`, kind: "shopify-subscribe", payload: { orgId } })
    .onConflictDoNothing()
}

// Worker job: subscribes the connected store to each topic it isn't subscribed to yet.
export async function shopifySubscribeJob(payload: Record<string, unknown>, assertOwned: () => Promise<void>) {
  const { orgId } = z.object({ orgId: z.uuid() }).parse(payload)
  const address = shopifyWebhookAddress()
  // Shopify only delivers to HTTPS addresses, so a local app without a tunnel can't subscribe.
  if (!address.startsWith("https://")) {
    console.warn(JSON.stringify({ event: "shopify_webhooks_skipped", orgId, reason: "APP_URL is not HTTPS" }))
    return
  }
  const [account] = await db()
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "shopify")))
  if (!account) {
    return
  }
  const shopify = await shopifyFor(orgId)
  await assertOwned()
  await shopify.subscribeWebhooks(address, shopifyWebhookTopics)
}
