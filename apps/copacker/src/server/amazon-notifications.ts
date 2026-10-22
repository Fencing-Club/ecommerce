import { ProviderError, sellerIdSchema } from "@repo/copacker-marketplaces/amazon"
import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { collectUpdatedAmazonSales } from "@repo/copacker-marketplaces/sales"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { chunked, excluded } from "@/db/helpers"
import { salesOrders, salesSyncs } from "@/db/schema"
import { amazonApp, amazonFor } from "./connections"
import type { JobInput } from "./job-payloads"
import { PollAgain, type JobContext } from "./job-runtime"
import { logEvent } from "./log"
import { connectedAccount } from "./provider-accounts"
import {
  eventWorkspace,
  queueEventJobs,
  queueSubscription,
  readMessage,
  settleMs,
  startEventSync,
  subscribeTopics
} from "./provider-events"
import { amazonSalesMarketplaces, requestSalesSync } from "./sales-orders"
import type { NotificationQueue } from "./sqs"
import { pollQueue, queueArn } from "./sqs"
import { refreshStock } from "./stock"

// Amazon sends notifications to an SQS queue (it has no HTTPS webhooks). Order changes update the stored orders by
// reading only the orders changed since the last read; FBA stock changes start a stock refresh.
export const amazonNotificationTypes = ["ORDER_CHANGE", "FBA_INVENTORY_AVAILABILITY_CHANGES"] as const
// Order changes are requested the way Amazon's ORDER_CHANGE tutorial does: status changes and buyer-requested changes
// (cancellations and address changes).
const processingDirectives: Partial<Record<(typeof amazonNotificationTypes)[number], Record<string, unknown>>> = {
  ORDER_CHANGE: {
    eventFilter: { eventFilterType: "ORDER_CHANGE", orderChangeTypes: ["OrderStatusChange", "BuyerRequestedChange"] }
  }
}
// How far before the stored orders' end each read starts, for changes Amazon records a little late.
const overlapMs = 5 * 60000
// Stored orders older than this are brought up to date by a full sync instead.
const incrementalDays = 7
// How long to wait before checking again whether a full sync has finished.
const syncWaitMs = 2 * 60000
// Amazon's order search refills about one request every three minutes once its burst is spent.
const throttleWaitMs = 3 * 60000

// Reads one batch of notifications and queues their work (see pollQueue).
export async function pollAmazonNotifications(queue: NotificationQueue, now = Date.now) {
  return pollQueue(queue, (body) => receiveAmazonNotification(body, now()))
}

const sellerPayload = z.object({ SellerId: sellerIdSchema })
const notificationSchema = z.discriminatedUnion("NotificationType", [
  z.object({
    NotificationType: z.literal("ORDER_CHANGE"),
    Payload: z.object({ OrderChangeNotification: sellerPayload })
  }),
  z.object({
    NotificationType: z.literal("FBA_INVENTORY_AVAILABILITY_CHANGES"),
    Payload: z.object({ FBAInventoryAvailabilityChangeNotification: sellerPayload })
  })
])

// Queues the work a notification calls for, for every workspace connected to the seller (see queueEventJobs). Returns
// how many were.
export async function receiveAmazonNotification(body: string, now = Date.now()) {
  const data = readMessage(body, notificationSchema, "amazon_notification_ignored")
  if (!data) {
    return 0
  }
  const target = data.NotificationType === "ORDER_CHANGE" ? "sales" : "stock"
  const sellerId =
    data.NotificationType === "ORDER_CHANGE"
      ? data.Payload.OrderChangeNotification.SellerId
      : data.Payload.FBAInventoryAvailabilityChangeNotification.SellerId
  return queueEventJobs("amazon-event", sellerId, {
    payload: (orgId) => ({ orgId, sellerId, target }),
    target,
    at: now
  })
}

// Worker job: brings the stored orders up to date, or starts an FBA stock refresh.
export async function amazonEventJob(
  { orgId, sellerId, target }: JobInput<"amazon-event">,
  { assertOwned }: Pick<JobContext, "assertOwned">,
  now = Date.now()
) {
  const org = await eventWorkspace(orgId, "amazon", sellerId)
  if (!org) {
    return
  }
  if (target === "stock") {
    await startEventSync(
      () => refreshStock(org, { source: "fba", marketplaceId: usMarketplaceId }),
      "Waiting for the running FBA stock refresh to finish"
    )
    return
  }
  await updateStoredOrders(org, sellerId, assertOwned, now)
}

// Reads the orders changed since the stored orders' end and saves them. Every order placed since then is among them, so
// the stored period extends to the read. Without a recent, current-shape stored period, a full sync runs instead.
async function updateStoredOrders(
  org: { id: string; kind: "buyer" | "supplier" | "forwarder" },
  sellerId: string,
  assertOwned: () => Promise<void>,
  now: number
) {
  const scope = and(eq(salesSyncs.orgId, org.id), eq(salesSyncs.source, "amazon"))
  const [sync] = await db().select().from(salesSyncs).where(scope)
  if (
    !sync ||
    sync.externalAccountId !== sellerId ||
    !sync.coveredFrom ||
    !sync.coveredTo ||
    sync.coveredTo.getTime() < now - incrementalDays * 86400000
  ) {
    const started = await requestSalesSync(org, "amazon")
    if (started.status === "running") {
      throw new PollAgain("Waiting for the running Amazon sync to finish", { delayMs: syncWaitMs })
    }
    return
  }
  // A full sync replaces periods of stored orders; let it finish rather than write alongside it.
  if (sync.status === "queued" || sync.status === "running") {
    throw new PollAgain("Waiting for the Amazon sync to finish", { delayMs: syncWaitMs })
  }
  const coveredFrom = sync.coveredFrom
  const end = new Date(now - settleMs)
  const since = new Date(sync.coveredTo.getTime() - overlapMs).toISOString()
  const amazon = await amazonFor(org.id, sellerId)
  let changed
  try {
    changed = await collectUpdatedAmazonSales(
      amazon,
      since,
      assertOwned,
      await amazonSalesMarketplaces(sellerId, amazon)
    )
  } catch (error) {
    // Throttled: come back after Amazon's interval rather than hold the worker. Nothing is saved yet, so the read
    // simply starts again.
    if (error instanceof ProviderError && [429, 503].includes(error.status)) {
      throw new PollAgain("Amazon is limiting order reads; reading again shortly", {
        delayMs: Math.max(error.retryAfterMs ?? 0, throttleWaitMs)
      })
    }
    throw error
  }
  // Orders placed before the stored period aren't kept.
  const orders = changed.filter((order) => Date.parse(order.createdTime) >= coveredFrom.getTime())
  await assertOwned()
  await db().transaction(async (tx) => {
    const [current] = await tx.select().from(salesSyncs).where(scope).for("update")
    if (!current || current.revision !== sync.revision || current.status === "queued" || current.status === "running") {
      throw new PollAgain("A newer Amazon sync started; reading again after it", { delayMs: syncWaitMs })
    }
    for (const batch of chunked(orders, 200)) {
      await tx
        .insert(salesOrders)
        .values(
          batch.map((order) => ({
            orgId: org.id,
            source: "amazon" as const,
            externalAccountId: sellerId,
            orderId: order.orderId,
            orderedAt: new Date(order.createdTime),
            data: order
          }))
        )
        .onConflictDoUpdate({
          target: [salesOrders.orgId, salesOrders.source, salesOrders.externalAccountId, salesOrders.orderId],
          set: { ...excluded(salesOrders, "orderedAt", "data"), syncedAt: new Date() }
        })
    }
    if (current.coveredTo && end > current.coveredTo) {
      await tx.update(salesSyncs).set({ coveredTo: end }).where(scope)
    }
  })
}

// Queues subscribing the workspace's seller to Copacker's notifications (see queueSubscription).
export async function queueAmazonSubscription(orgId: string, key: string) {
  await queueSubscription("amazon-subscribe", orgId, key)
}

// Worker job: makes sure Copacker's queue is a notification destination and the seller is subscribed to it.
export async function amazonSubscribeJob(
  { orgId }: JobInput<"amazon-subscribe">,
  { assertOwned }: Pick<JobContext, "assertOwned">
) {
  const queueUrl = process.env.AMAZON_NOTIFICATIONS_QUEUE_URL
  if (!queueUrl) {
    logEvent("warn", "amazon_notifications_skipped", { orgId, reason: "no queue configured" })
    return
  }
  const account = await connectedAccount(orgId, "amazon")
  if (!account) {
    return
  }
  const destinationId = await amazonApp("sellingpartnerapi::notifications").notificationDestination(
    queueArn(queueUrl),
    "copacker"
  )
  const seller = await amazonFor(orgId, account.externalId)
  await subscribeTopics("Amazon", amazonNotificationTypes, assertOwned, (type) =>
    seller.subscribeNotifications(type, destinationId, processingDirectives[type])
  )
}
