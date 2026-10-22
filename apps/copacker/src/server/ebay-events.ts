import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge"
import { Ebay, ebaySignatureHeader, verifyEbaySignature } from "@repo/copacker-marketplaces/ebay"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, salesOrders, salesSyncs } from "@/db/schema"
import { ebayApp, ebayFor } from "./connections"
import { ebayEndpoint, ebayVerificationToken, hasPublicEbayEndpoint } from "./ebay-notifications"
import type { JobInput } from "./job-payloads"
import type { JobContext } from "./job-runtime"
import { logEvent } from "./log"
import { connectedAccount } from "./provider-accounts"
import {
  eventWorkspace,
  queueEventJobs,
  queueSubscription,
  readMessage,
  startEventSync,
  subscribeTopics
} from "./provider-events"
import { rateLimit } from "./rate-limit"
import { requestSalesSync } from "./sales-orders"
import type { NotificationQueue } from "./sqs"
import { pollQueue } from "./sqs"

// The order topics each seller is subscribed to. A confirmed order starts the order sync, which also reads the last
// 30 days again, so shipments and cancellations arrive with the next order or the daily reconciliation.
export const ebayOrderTopics = ["ORDER_CONFIRMATION"] as const
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

// The app's own eBay client, kept for the process so its token is reused until it expires. Other keys (in tests) make
// another.
let appClient: { clientId: string; clientSecret: string; ebay: Ebay } | null = null
function ebayAppClient() {
  const app = ebayApp()
  if (!app) {
    return null
  }
  if (appClient?.clientId !== app.clientId || appClient.clientSecret !== app.clientSecret) {
    const credentials = { clientId: app.clientId, clientSecret: app.clientSecret }
    appClient = { ...credentials, ebay: new Ebay(credentials) }
  }
  return appClient.ebay
}

// eBay's signing keys, by ID. eBay rarely rotates them, so each is kept for an hour. An ID eBay didn't hand a key over
// for is kept as a miss for five minutes, and each address may look up only ten keys that aren't kept in ten minutes,
// so forged signatures can't make Copacker call eBay again and again.
const keys = new Map<string, { key: string | null; until: number }>()
const keyMs = 3600000
const missMs = 5 * 60000
const keyLookups = rateLimit({ period: 10 * 60000, allowed: 10 })

async function lookUpKey(app: Ebay, keyId: string) {
  let entry: { key: string | null; until: number }
  try {
    const { key } = await app.publicKey(keyId)
    entry = { key, until: Date.now() + keyMs }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "ebay_signing_key_failed",
        error: error instanceof Error ? error.message : "unknown error"
      })
    )
    entry = { key: null, until: Date.now() + missMs }
  }
  // Past a thousand IDs, the expired ones and the misses are dropped. eBay's own keys are few, and stay.
  if (keys.size >= 1000) {
    for (const [other, { key, until }] of keys) {
      if (!key || until <= Date.now()) {
        keys.delete(other)
      }
    }
  }
  keys.set(keyId, entry)
  return entry.key
}

// Whether eBay signed the body: "signed", "bad signature", "unchecked" when it couldn't be checked (no app keys, or eBay
// didn't hand over its key), or "rate limited" when the client asked for too many keys Copacker doesn't keep. The
// client is the address the request came from.
export async function ebaySigned(body: string, header: string | null, client: string) {
  const signature = ebaySignatureHeader.safeParse(header ?? "")
  if (!signature.success) {
    return "bad signature"
  }
  const { kid } = signature.data
  const cached = keys.get(kid)
  let key: string | null
  if (cached && Date.now() < cached.until) {
    key = cached.key
  } else {
    const app = ebayAppClient()
    if (!app) {
      console.error(
        JSON.stringify({ event: "ebay_signing_key_failed", error: "eBay developer credentials are not configured" })
      )
      return "unchecked"
    }
    if (keyLookups(client)) {
      return "rate limited"
    }
    key = await lookUpKey(app, kid)
  }
  if (!key) {
    return "unchecked"
  }
  try {
    return verifyEbaySignature(body, signature.data.signature, key) ? "signed" : "bad signature"
  } catch {
    return "bad signature"
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
async function sendToEventBridge(bus: string, notification: EbayNotification) {
  // The Workers/browser SDK uses fetch and does not read Node's environment credential/region providers.
  // Keep each invocation's client and request lifecycle separate.
  const {
    AWS_REGION: region,
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
    AWS_SESSION_TOKEN: sessionToken
  } = process.env
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials and region are required to forward eBay notifications")
  }
  const eventBridge = new EventBridgeClient({ region, credentials: { accessKeyId, secretAccessKey, sessionToken } })
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

// Queues the work a notification calls for (see queueEventJobs). Returns how many workspaces it reached.
export async function receiveEbayNotification(notification: EbayNotification, now = Date.now()) {
  const { topic } = notification.metadata
  const seller = sellerOf.safeParse(notification.notification.data)
  logEvent("info", "ebay_notification", { topic, notificationId: notification.notification.notificationId })
  if (!seller.success) {
    return 0
  }
  if (topic === "MARKETPLACE_ACCOUNT_DELETION") {
    return eraseEbayAccount(seller.data)
  }
  if (!ebayOrderTopics.some((orderTopic) => orderTopic === topic)) {
    return 0
  }
  return queueEventJobs("ebay-event", seller.data, { payload: (orgId) => ({ orgId, userId: seller.data }), at: now })
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
export async function ebayEventJob({ orgId, userId }: JobInput<"ebay-event">) {
  const org = await eventWorkspace(orgId, "ebay", userId)
  if (org) {
    await startEventSync(() => requestSalesSync(org, "ebay"), "Waiting for the running eBay sync to finish")
  }
}

// Queues subscribing the workspace's seller to Copacker's order notifications (see queueSubscription).
export async function queueEbaySubscription(orgId: string, key: string) {
  await queueSubscription("ebay-subscribe", orgId, key)
}

// Worker job: makes sure the app's notification destination points at the webhook, then subscribes the seller to each
// order topic.
export async function ebaySubscribeJob(
  { orgId }: JobInput<"ebay-subscribe">,
  { assertOwned }: Pick<JobContext, "assertOwned">
) {
  const app = ebayAppClient()
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
    logEvent("warn", "ebay_notifications_skipped", { orgId, reason: skipped })
    return
  }
  const account = await connectedAccount(orgId, "ebay")
  if (!account) {
    return
  }
  const existing = (await app.destinations()).find((destination) => destination.deliveryConfig?.endpoint === endpoint)
  const destinationId =
    existing?.destinationId ?? (await app.createDestination("Copacker", endpoint, verificationToken))
  if (existing && existing.status !== "ENABLED") {
    await app.updateDestination(destinationId, "Copacker", endpoint, verificationToken)
  }
  const seller = await ebayFor(orgId, account.externalId)
  const subscriptions = await seller.subscriptions()
  await subscribeTopics("eBay", ebayOrderTopics, assertOwned, async (topic) => {
    const current = subscriptions.find((subscription) => subscription.topicId === topic)
    if (!current) {
      await seller.subscribe(topic, destinationId)
    } else if (current.status !== "ENABLED") {
      await seller.enableSubscription(current.subscriptionId)
    }
  })
}

// EventBridge wraps each notification the route sent as the event's detail.
const eventBridgeEvent = z.object({ source: z.literal(ebayEventSource), detail: ebayNotificationSchema })

// Handles one event from the queue. The queue only accepts events from the app's own EventBridge rule, and the route
// checked eBay's signature before sending it. Returns false for a message it can't use.
export async function receiveEbayEvent(body: string, now = Date.now()) {
  const event = readMessage(body, eventBridgeEvent, "ebay_event_ignored")
  if (!event) {
    return false
  }
  await receiveEbayNotification(event.detail, now)
  return true
}

// Reads one batch of events from the queue and queues their work (see pollQueue).
export async function pollEbayEvents(queue: NotificationQueue, now = Date.now) {
  return pollQueue(queue, (body) => receiveEbayEvent(body, now()))
}
