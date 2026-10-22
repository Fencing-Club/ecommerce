import { shopDomainSchema, ShopifyRequestError } from "@repo/copacker-marketplaces/shopify"
import { grantedScopes } from "@repo/copacker-marketplaces/shopify-auth"
import { objectEntries, objectKeys } from "ts-extras"
import { z } from "zod"
import { disconnect, shopifyFor } from "./connections"
import { ReconnectRequiredError } from "./errors"
import type { JobInput } from "./job-payloads"
import type { JobContext } from "./job-runtime"
import { logEvent } from "./log"
import { connectedAccount } from "./provider-accounts"
import { eventWorkspace, queueEventJobs, queueSubscription, readMessage, startEventSync } from "./provider-events"
import { requestSalesSync } from "./sales-orders"
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
// Shopify delivers events to the app's Amazon EventBridge source, which forwards them to an SQS queue the worker
// reads. A queue keeps events through outages that HTTPS webhook retries don't outlast.
const eventBridgeSource = z
  .string()
  .regex(/^arn:aws:events:[a-z0-9-]+::event-source\/aws\.partner\/shopify\.com\/\d+\/[\w.-]+$/)

// Queues the work a Shopify event calls for, for every workspace connected to the store (see queueEventJobs). An
// uninstall is handled right away; other events wait for their period.
async function receiveShopifyWebhook(topic: string, shop: string, now: number) {
  const target = eventTargets.get(topic)
  if (!target || !shopDomainSchema.safeParse(shop).success) {
    return 0
  }
  return queueEventJobs("shopify-event", shop, {
    payload: (orgId) => ({ orgId, shop, target }),
    target,
    at: now,
    immediate: target === "uninstalled"
  })
}

// Worker job: starts the sync an event calls for, or removes the connection when the store uninstalled the app.
export async function shopifyEventJob({ orgId, shop, target }: JobInput<"shopify-event">) {
  const org = await eventWorkspace(orgId, "shopify", shop)
  if (!org) {
    return
  }
  if (target === "uninstalled") {
    // A store that reinstalls the app right away sends the uninstall late; its new authorization still works.
    if (await authorizationRevoked(orgId)) {
      await disconnect(orgId, "shopify")
    }
    return
  }
  await startEventSync(
    () => (target === "sales" ? requestSalesSync(org, "shopify") : refreshStock(org, { source: "shopify" })),
    "Waiting for the running Shopify sync to finish"
  )
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

// Queues subscribing the workspace's store to Copacker's webhooks (see queueSubscription).
export async function queueShopifySubscription(orgId: string, key: string) {
  await queueSubscription("shopify-subscribe", orgId, key)
}

// Worker job: subscribes the connected store to each topic it isn't subscribed to yet, at the EventBridge source.
export async function shopifySubscribeJob(
  { orgId }: JobInput<"shopify-subscribe">,
  { assertOwned }: Pick<JobContext, "assertOwned">
) {
  const configured = process.env.SHOPIFY_EVENTBRIDGE_SOURCE_ARN
  // An app without its own EventBridge source (such as local development) can't subscribe; syncs still copy orders.
  if (!configured) {
    logEvent("warn", "shopify_webhooks_skipped", { orgId, reason: "no EventBridge source" })
    return
  }
  const source = eventBridgeSource.parse(configured)
  const account = await connectedAccount(orgId, "shopify")
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
  const event = readMessage(body, eventBridgeEvent, "shopify_event_ignored")
  if (!event) {
    return false
  }
  const headers = new Map(
    Object.entries(event.detail.metadata).map(([name, value]) => [name.toLowerCase(), String(value)])
  )
  const topic = headers.get("x-shopify-topic") ?? ""
  if (shopifyComplianceTopics.some((compliance) => compliance === topic)) {
    const deliveryId = headers.get("x-shopify-webhook-id") ?? event.id
    await receiveShopifyCompliance(topic, event.detail.payload, deliveryId)
    return true
  }
  await receiveShopifyWebhook(topic, headers.get("x-shopify-shop-domain") ?? "", now)
  return true
}

// Reads one batch of events from the EventBridge queue and queues their work (see pollQueue).
export async function pollShopifyEvents(queue: NotificationQueue, now = Date.now) {
  return pollQueue(queue, (body) => receiveShopifyEvent(body, now()))
}
