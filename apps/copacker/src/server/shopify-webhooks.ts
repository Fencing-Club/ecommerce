import { shopDomainSchema, ShopifyRequestError } from "@repo/copacker-marketplaces/shopify"
import { grantedScopes } from "@repo/copacker-marketplaces/shopify-auth"
import { and, eq } from "drizzle-orm"
import { objectEntries, objectKeys } from "ts-extras"
import { z } from "zod"
import { db } from "@/db"
import { connections, jobs, organizations } from "@/db/schema"
import { withJobWake } from "@/server/job-delivery"
import { disconnect, shopifyFor } from "./connections"
import { ReconnectRequiredError } from "./errors"
import { jobRow, type JobInput } from "./job-payloads"
import { PollAgain, type JobContext } from "./job-runtime"
import { requestSalesSync, SalesSyncError } from "./sales-orders"
import { receiveShopifyCompliance, shopifyComplianceTopics } from "./shopify-compliance"
import type { NotificationQueue } from "./sqs"
import { pollQueue } from "./sqs"
import { refreshStock } from "./stock"

// What Shopify tells Copacker about: every change to data Copacker copies. The events only say that something changed;
// the existing syncs read the changes. Orders, refunds, payments and shipments start the order sync, which also reads
// the Shopify balance. Products, variants (title, SKU, metafields, bundle components), inventory items
// (tracking, cost, country of origin), stock levels and locations start the stock sync.
const topicTargets = {
  ORDERS_CREATE: "sales",
  ORDERS_UPDATED: "sales",
  ORDERS_EDITED: "sales",
  ORDERS_CANCELLED: "sales",
  ORDERS_DELETE: "sales",
  REFUNDS_CREATE: "sales",
  ORDER_TRANSACTIONS_CREATE: "sales",
  FULFILLMENTS_CREATE: "sales",
  FULFILLMENTS_UPDATE: "sales",
  PRODUCTS_CREATE: "stock",
  PRODUCTS_UPDATE: "stock",
  PRODUCTS_DELETE: "stock",
  INVENTORY_ITEMS_CREATE: "stock",
  INVENTORY_ITEMS_UPDATE: "stock",
  INVENTORY_ITEMS_DELETE: "stock",
  INVENTORY_LEVELS_CONNECT: "stock",
  INVENTORY_LEVELS_UPDATE: "stock",
  INVENTORY_LEVELS_DISCONNECT: "stock",
  LOCATIONS_CREATE: "stock",
  LOCATIONS_UPDATE: "stock",
  LOCATIONS_DELETE: "stock",
  LOCATIONS_ACTIVATE: "stock",
  LOCATIONS_DEACTIVATE: "stock",
  APP_UNINSTALLED: "uninstalled"
} as const satisfies Record<string, "sales" | "stock" | "uninstalled">
export const shopifyWebhookTopics = objectKeys(topicTargets)
// Topics Shopify refuses unless the store granted a scope. A store connected before Copacker asked for the scope grants
// it by reconnecting; until then, orders/updated still reports its shipments.
const topicScopes = new Map<string, string>([
  ["FULFILLMENTS_CREATE", "read_fulfillments"],
  ["FULFILLMENTS_UPDATE", "read_fulfillments"]
])
// Events name their topic in lower case with a slash before the action, such as inventory_levels/update.
const eventTargets = new Map<string, (typeof topicTargets)[keyof typeof topicTargets]>(
  objectEntries(topicTargets).map(([topic, target]) => [topic.toLowerCase().replace(/_(?=[a-z]+$)/, "/"), target])
)
// Events are gathered into five-minute periods and each period starts one sync, so a burst of orders reads Shopify
// once. The sync starts three minutes after its period ends, when the orders in it have settled (see syncChunks).
const batchMs = 5 * 60000
const settleMs = 3 * 60000

// Shopify delivers events to the app's Amazon EventBridge source, which forwards them to an SQS queue the worker
// reads. A queue keeps events through outages that HTTPS webhook retries don't outlast.
const eventBridgeSource = z
  .string()
  .regex(/^arn:aws:events:[a-z0-9-]+::event-source\/aws\.partner\/shopify\.com\/\d+\/[\w.-]+$/)

// Queues the work a Shopify event calls for, for every workspace connected to the store. Returns how many were.
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
  await withJobWake(
    db()
      .insert(jobs)
      .values(
        accounts.map(({ orgId }) =>
          jobRow(
            "shopify-event",
            `shopify-event:${orgId}:${target}:${batch}`,
            { orgId, shop, target },
            { runAt: new Date(target === "uninstalled" ? now : (batch + 1) * batchMs + settleMs) }
          )
        )
      )
      .onConflictDoNothing()
  )
  return accounts.length
}

// Worker job: starts the sync an event calls for, or removes the connection when the store uninstalled the app.
export async function shopifyEventJob({ orgId, shop, target }: JobInput<"shopify-event">) {
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
  await withJobWake(
    db()
      .insert(jobs)
      .values(jobRow("shopify-subscribe", `shopify-subscribe:${orgId}:${key}`, { orgId }))
      .onConflictDoNothing()
  )
}

// Worker job: subscribes the connected store to each topic it isn't subscribed to yet, at the EventBridge source.
export async function shopifySubscribeJob(
  { orgId }: JobInput<"shopify-subscribe">,
  { assertOwned }: Pick<JobContext, "assertOwned">
) {
  const configured = process.env.SHOPIFY_EVENTBRIDGE_SOURCE_ARN
  // An app without its own EventBridge source (such as local development) can't subscribe; syncs still copy orders.
  if (!configured) {
    console.warn(JSON.stringify({ event: "shopify_webhooks_skipped", orgId, reason: "no EventBridge source" }))
    return
  }
  const source = eventBridgeSource.parse(configured)
  const [account] = await db()
    .select({ scopes: connections.scopes })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "shopify")))
  if (!account) {
    return
  }
  const shopify = await shopifyFor(orgId)
  await assertOwned()
  const granted = grantedScopes(account.scopes)
  const topics = shopifyWebhookTopics.filter((topic) => {
    const scope = topicScopes.get(topic)
    return !scope || granted.has(scope)
  })
  await shopify.subscribeWebhooks(source, topics)
}

// Shopify's EventBridge events carry the webhook's headers as metadata and its body as the payload.
const eventBridgeEvent = z.object({
  id: z.string(),
  detail: z.object({ metadata: z.record(z.string(), z.unknown()), payload: z.unknown() })
})

// Handles one event from the EventBridge queue. The queue only accepts events from the app's own EventBridge rule,
// so there's no signature to check. Returns false for a message that isn't a Shopify event, which is dropped; a privacy
// webhook it can't read throws instead, so it isn't lost (see receiveShopifyCompliance).
export async function receiveShopifyEvent(body: string, now = Date.now()) {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    json = null
  }
  const event = eventBridgeEvent.safeParse(json)
  if (!event.success) {
    console.warn(JSON.stringify({ event: "shopify_event_ignored", reason: "unrecognized event" }))
    return false
  }
  const headers = new Map(
    Object.entries(event.data.detail.metadata).map(([name, value]) => [name.toLowerCase(), String(value)])
  )
  const topic = headers.get("x-shopify-topic") ?? ""
  if (shopifyComplianceTopics.some((compliance) => compliance === topic)) {
    const deliveryId = headers.get("x-shopify-webhook-id") ?? event.data.id
    await receiveShopifyCompliance(topic, event.data.detail.payload, deliveryId)
    return true
  }
  await receiveShopifyWebhook(topic, headers.get("x-shopify-shop-domain") ?? "", now)
  return true
}

// Reads one batch of events from the EventBridge queue and queues their work (see pollQueue).
export async function pollShopifyEvents(queue: NotificationQueue, now = Date.now) {
  return pollQueue(queue, (body) => receiveShopifyEvent(body, now()))
}
