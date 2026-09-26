import { shopDomainSchema } from "@repo/aisle/shopify"
import { and, eq, inArray, notInArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, jobs, memberships, salesOrders, salesSyncs, stockDays, stockSnapshots } from "@/db/schema"
import { summarizeSalesOrder } from "./sales-orders"

// Shopify's mandatory privacy webhooks. Copacker copies orders for restock planning: order numbers, dates, SKUs,
// quantities, prices and fulfillment status. It never stores a customer's name, email address, phone number or
// address, so there is nothing personal to erase when a customer asks, and a data request is answered with the stored
// order details. Customer contact details in the webhooks are never kept.
export const shopifyComplianceTopics = ["customers/data_request", "customers/redact", "shop/redact"] as const
const orderIds = z.array(z.number().int().positive().safe()).max(1000)
const dataRequest = z.object({
  shop_domain: shopDomainSchema,
  orders_requested: orderIds,
  data_request: z.object({ id: z.number().int().positive().safe() })
})
const shopRedact = z.object({ shop_domain: shopDomainSchema })

// Queues the work a verified compliance webhook calls for. Returns false for a body that isn't what Shopify sends.
export async function receiveShopifyCompliance(topic: string, body: string, deliveryId: string) {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return false
  }
  let payload: Record<string, unknown>
  if (topic === "customers/data_request") {
    const input = dataRequest.safeParse(json)
    if (!input.success) {
      return false
    }
    payload = {
      topic,
      shop: input.data.shop_domain,
      orders: input.data.orders_requested,
      requestId: input.data.data_request.id
    }
  } else if (topic === "shop/redact") {
    const input = shopRedact.safeParse(json)
    if (!input.success) {
      return false
    }
    payload = { topic, shop: input.data.shop_domain }
  } else {
    // customers/redact: the stored orders hold nothing that identifies the customer (see above).
    return true
  }
  await db()
    .insert(jobs)
    .values({ key: `shopify-compliance:${deliveryId}`, kind: "shopify-compliance", payload })
    .onConflictDoNothing()
  return true
}

const compliancePayload = z.discriminatedUnion("topic", [
  z.object({
    topic: z.literal("customers/data_request"),
    shop: shopDomainSchema,
    orders: orderIds,
    requestId: z.number().int().positive().safe()
  }),
  z.object({ topic: z.literal("shop/redact"), shop: shopDomainSchema })
])

// Worker job: answers a customer data request, or erases a store's data once Shopify says the store is gone.
export async function shopifyComplianceJob(payload: Record<string, unknown>) {
  const input = compliancePayload.parse(payload)
  if (input.topic === "shop/redact") {
    await redactShop(input.shop)
  } else {
    await reportCustomerData(input.shop, input.orders, input.requestId)
  }
}

// Sends the owners of every workspace that holds the store's orders, or is connected to it, the stored details of
// the requested orders, so the merchant can include them in the answer to the customer.
async function reportCustomerData(shop: string, orders: number[], requestId: number) {
  const ids = orders.map((id) => `gid://shopify/Order/${id}`)
  const stored = ids.length
    ? await db()
        .select({ orgId: salesOrders.orgId, orderedAt: salesOrders.orderedAt, data: salesOrders.data })
        .from(salesOrders)
        .where(
          and(
            eq(salesOrders.source, "shopify"),
            eq(salesOrders.externalAccountId, shop),
            inArray(salesOrders.orderId, ids)
          )
        )
    : []
  const connected = await db()
    .select({ orgId: connections.orgId })
    .from(connections)
    .where(and(eq(connections.provider, "shopify"), eq(connections.externalId, shop)))
  const orgIds = [...new Set([...stored.map((row) => row.orgId), ...connected.map((row) => row.orgId)])]
  if (!orgIds.length) {
    return
  }
  const owners = await db()
    .select({ orgId: memberships.orgId, email: memberships.email })
    .from(memberships)
    .where(and(inArray(memberships.orgId, orgIds), eq(memberships.role, "owner")))
  const emails = owners.map((owner) => ({
    key: `email:data-request:${requestId}:${owner.orgId}:${owner.email}`,
    kind: "email" as const,
    payload: {
      type: "data_request",
      to: owner.email,
      shop,
      requestId,
      orders: stored
        .filter((row) => row.orgId === owner.orgId)
        .map((row) => describeOrder(summarizeSalesOrder("shopify", row.orderedAt, row.data, shop)))
    }
  }))
  if (emails.length) {
    await db().insert(jobs).values(emails).onConflictDoNothing()
  }
}

function describeOrder(order: ReturnType<typeof summarizeSalesOrder>) {
  const items = order.items.map((item) => `${item.quantity} × ${item.sku ?? "item without a SKU"}`).join(", ")
  return `Order ${order.number}, placed ${order.orderedAt.slice(0, 10)}, status ${order.status}: ${items || "no items"}`
}

// Erases what Copacker copied from the store, 48 hours after it uninstalled the app. A workspace that connected the
// store again keeps its copy. Purchase orders stay: they are the buyer's and supplier's records, not store data.
async function redactShop(shop: string) {
  const connected = (
    await db()
      .select({ orgId: connections.orgId })
      .from(connections)
      .where(and(eq(connections.provider, "shopify"), eq(connections.externalId, shop)))
  ).map((row) => row.orgId)
  await db().transaction(async (tx) => {
    await tx
      .delete(salesOrders)
      .where(
        and(
          eq(salesOrders.source, "shopify"),
          eq(salesOrders.externalAccountId, shop),
          notInArray(salesOrders.orgId, connected)
        )
      )
    await tx
      .delete(salesSyncs)
      .where(
        and(
          eq(salesSyncs.source, "shopify"),
          eq(salesSyncs.externalAccountId, shop),
          notInArray(salesSyncs.orgId, connected)
        )
      )
    await tx
      .delete(stockSnapshots)
      .where(
        and(
          eq(stockSnapshots.source, "shopify"),
          eq(stockSnapshots.externalAccountId, shop),
          notInArray(stockSnapshots.orgId, connected)
        )
      )
    await tx.delete(stockDays).where(and(eq(stockDays.externalAccountId, shop), notInArray(stockDays.orgId, connected)))
  })
}
