import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge"
import { Ebay, ebaySignatureHeader, verifyEbaySignature } from "@repo/aisle/ebay"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, jobs, organizations, salesOrders, salesSyncs } from "@/db/schema"
import { ebayApp, ebayFor } from "./connections"
import { ebayEndpoint, ebayVerificationToken, hasPublicEbayEndpoint } from "./ebay-notifications"
import { PollAgain } from "./job-handlers"
import { logLine } from "./log"
import { requestSalesSync, SalesSyncError } from "./sales-orders"
import { type NotificationQueue, pollQueue } from "./sqs"

// The order topics each seller is subscribed to. A confirmed order starts the order sync, which also reads the last
// 30 days again, so shipments and cancellations arrive with the next order or the daily reconciliation.
export const ebayOrderTopics = ["ORDER_CONFIRMATION"] as const
// Notifications are gathered into five-minute periods; each period starts one sync three minutes after it ends, when
// the orders in it have settled (see syncChunks).
const batchMs = 5 * 60000
const settleMs = 3 * 60000
// Events Copacker sends to EventBridge carry this source, which the rule forwarding them to the queue matches.
export const ebayEventSource = "copacker.ebay"

export const ebayNotificationSchema = z.object({
  metadata: z.object({ topic: z.string().min(1).max(100) }),
  notification: z.object({ notificationId: z.string().min(1).max(200), data: z.unknown().optional() })
})
export type EbayNotification = z.infer<typeof ebayNotificationSchema>

// The seller a notification is about. Order topics name the seller as `user`; shipment and deletion notices name them
// directly.
const sellerOf = z.union([
  z.object({ user: z.object({ userId: z.string().min(1) }) }).transform((data) => data.user.userId),
  z.object({ publicUserId: z.string().min(1) }).transform((data) => data.publicUserId),
  z.object({ userId: z.string().min(1) }).transform((data) => data.userId)
])

// eBay's signing keys, by ID. eBay rarely rotates them, so each is kept for an hour.
const keys = new Map<string, { key: string; at: number }>()
async function signingKey(keyId: string, now = Date.now()) {
  const cached = keys.get(keyId)
  if (cached && now - cached.at < 3600000) {
    return cached.key
  }
  const app = ebayApp()
  if (!app) {
    throw new Error("eBay developer credentials are not configured")
  }
  const { key } = await new Ebay({ clientId: app.clientId, clientSecret: app.clientSecret }).publicKey(keyId)
  keys.set(keyId, { key, at: now })
  return key
}

// Whether eBay signed the body: true, false, or null when the signature couldn't be checked (no app keys, or eBay
// didn't hand over its key).
export async function ebaySigned(body: string, header: string | null) {
  const signature = ebaySignatureHeader.safeParse(header ?? "")
  if (!signature.success) {
    return false
  }
  let key: string
  try {
    key = await signingKey(signature.data.kid)
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "ebay_signing_key_failed",
        error: error instanceof Error ? error.message : "unknown error"
      })
    )
    return null
  }
  try {
    return verifyEbaySignature(body, signature.data.signature, key)
  } catch {
    return false
  }
}

// Where the webhook route sends verified notifications: to EventBridge when EBAY_EVENT_BUS names a bus (the queue the
// worker reads keeps them through outages), and otherwise, such as in local development, straight to their work.
export async function forwardEbayNotification(notification: EbayNotification, send = sendToEventBridge) {
  const bus = process.env.EBAY_EVENT_BUS
  if (!bus) {
    await receiveEbayNotification(notification)
    return "handled"
  }
  await send(bus, notification)
  return "forwarded"
}
let eventBridge: EventBridgeClient | null = null
async function sendToEventBridge(bus: string, notification: EbayNotification) {
  eventBridge ??= new EventBridgeClient({})
  const result = await eventBridge.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: bus,
          Source: ebayEventSource,
          DetailType: notification.metadata.topic,
          Detail: JSON.stringify(notification)
        }
      ]
    })
  )
  if (result.FailedEntryCount) {
    throw new Error(`EventBridge refused the eBay event: ${result.Entries?.[0]?.ErrorCode ?? "unknown error"}`)
  }
}

// Queues the work a notification calls for. Returns how many workspaces it reached.
export async function receiveEbayNotification(notification: EbayNotification, now = Date.now()) {
  const { topic } = notification.metadata
  const seller = sellerOf.safeParse(notification.notification.data)
  logLine(`eBay ${topic} notification ${notification.notification.notificationId}`)
  if (!seller.success) {
    return 0
  }
  if (topic === "MARKETPLACE_ACCOUNT_DELETION") {
    return eraseEbayAccount(seller.data)
  }
  if (!ebayOrderTopics.some((orderTopic) => orderTopic === topic)) {
    return 0
  }
  const accounts = await db()
    .select({ orgId: connections.orgId })
    .from(connections)
    .where(and(eq(connections.provider, "ebay"), eq(connections.externalId, seller.data)))
  if (!accounts.length) {
    return 0
  }
  const batch = Math.floor(now / batchMs)
  await db()
    .insert(jobs)
    .values(
      accounts.map(({ orgId }) => ({
        key: `ebay-event:${orgId}:${batch}`,
        kind: "ebay-event" as const,
        payload: { orgId, userId: seller.data },
        runAt: new Date((batch + 1) * batchMs + settleMs)
      }))
    )
    .onConflictDoNothing()
  return accounts.length
}

// An eBay member closed their account or asked eBay to delete their data. Copacker keeps no buyer details, so only a
// seller's own account is stored: its connection, orders and order syncs are erased from every workspace.
async function eraseEbayAccount(userId: string) {
  return db().transaction(async (tx) => {
    const removed = await tx
      .delete(connections)
      .where(and(eq(connections.provider, "ebay"), eq(connections.externalId, userId)))
      .returning({ orgId: connections.orgId })
    await tx.delete(salesOrders).where(and(eq(salesOrders.source, "ebay"), eq(salesOrders.externalAccountId, userId)))
    await tx.delete(salesSyncs).where(and(eq(salesSyncs.source, "ebay"), eq(salesSyncs.externalAccountId, userId)))
    return removed.length
  })
}

// Worker job: starts the order sync a period's notifications call for.
export async function ebayEventJob(payload: Record<string, unknown>) {
  const { orgId, userId } = z.object({ orgId: z.uuid(), userId: z.string().min(1) }).parse(payload)
  const [account] = await db()
    .select({ externalId: connections.externalId, kind: organizations.kind })
    .from(connections)
    .innerJoin(organizations, eq(organizations.id, connections.orgId))
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "ebay")))
  // The workspace disconnected or switched accounts after the notification arrived.
  if (!account || account.externalId !== userId) {
    return
  }
  let started
  try {
    started = await requestSalesSync({ id: orgId, kind: account.kind }, "ebay")
  } catch (error) {
    if (error instanceof SalesSyncError) {
      return
    }
    throw error
  }
  // A running sync started before these orders, so it may miss them; start another once it finishes.
  if (started.status === "running") {
    throw new PollAgain("Waiting for the running eBay sync to finish")
  }
}

// Queues subscribing the workspace's seller to Copacker's order notifications. Runs after connecting and daily, which
// also turns back on subscriptions eBay disabled after failed deliveries.
export async function queueEbaySubscription(orgId: string, key: string) {
  await db()
    .insert(jobs)
    .values({ key: `ebay-subscribe:${orgId}:${key}`, kind: "ebay-subscribe", payload: { orgId } })
    .onConflictDoNothing()
}

// Worker job: makes sure the app's notification destination points at the webhook, then subscribes the seller to each
// order topic.
export async function ebaySubscribeJob(payload: Record<string, unknown>, assertOwned: () => Promise<void>) {
  const { orgId } = z.object({ orgId: z.uuid() }).parse(payload)
  const app = ebayApp()
  const verificationToken = ebayVerificationToken()
  const endpoint = ebayEndpoint()
  // eBay only delivers to public HTTPS addresses, so local development can't subscribe, and an environment without the
  // verification token (such as staging) leaves notifications to production. Syncs still copy orders.
  let skipped: string | null = null
  if (!app) {
    skipped = "no eBay keys"
  } else if (!verificationToken) {
    skipped = "no verification token"
  } else if (!hasPublicEbayEndpoint()) {
    skipped = "no public endpoint"
  }
  if (skipped || !app || !verificationToken) {
    console.warn(JSON.stringify({ event: "ebay_notifications_skipped", orgId, reason: skipped }))
    return
  }
  const [account] = await db()
    .select({ externalId: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "ebay")))
  if (!account) {
    return
  }
  const appClient = new Ebay({ clientId: app.clientId, clientSecret: app.clientSecret })
  const existing = (await appClient.destinations()).find(
    (destination) => destination.deliveryConfig?.endpoint === endpoint
  )
  const destinationId =
    existing?.destinationId ?? (await appClient.createDestination("Copacker", endpoint, verificationToken))
  if (existing && existing.status !== "ENABLED") {
    await appClient.updateDestination(destinationId, "Copacker", endpoint, verificationToken)
  }
  const seller = await ebayFor(orgId, account.externalId)
  const subscriptions = await seller.subscriptions()
  for (const topic of ebayOrderTopics) {
    await assertOwned()
    const current = subscriptions.find((subscription) => subscription.topicId === topic)
    try {
      if (!current) {
        await seller.subscribe(topic, destinationId)
      } else if (current.status !== "ENABLED") {
        await seller.enableSubscription(current.subscriptionId)
      }
    } catch (error) {
      throw new Error(
        `eBay ${topic} subscription failed: ${error instanceof Error ? error.message : "unknown error"}`,
        {
          cause: error
        }
      )
    }
  }
}

// EventBridge wraps each notification the route sent as the event's detail.
const eventBridgeEvent = z.object({ source: z.literal(ebayEventSource), detail: ebayNotificationSchema })

// Handles one event from the queue. The queue only accepts events from the app's own EventBridge rule, and the route
// checked eBay's signature before sending it. Returns false for a message it can't use.
export async function receiveEbayEvent(body: string, now = Date.now()) {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    json = null
  }
  const event = eventBridgeEvent.safeParse(json)
  if (!event.success) {
    console.warn(JSON.stringify({ event: "ebay_event_ignored", reason: "unrecognized event" }))
    return false
  }
  await receiveEbayNotification(event.data.detail, now)
  return true
}

// Reads one batch of events from the queue and queues their work (see pollQueue).
export async function pollEbayEvents(queue: NotificationQueue, now = Date.now) {
  return pollQueue(queue, (body) => receiveEbayEvent(body, now()))
}
