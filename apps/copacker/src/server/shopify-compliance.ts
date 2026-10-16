import { shopDomainSchema } from "@repo/aisle/shopify"
import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import {
  connections,
  jobs,
  memberships,
  profiles,
  salesOrders,
  salesSyncs,
  stockDays,
  stockSnapshots
} from "@/db/schema"
import type { Locale } from "@/i18n/locales"
import { defaultLocale, isLocale } from "@/i18n/locales"
import { translatorFor } from "@/i18n/translator"
import { summarizeSalesOrder } from "./sales-orders"

// Shopify's mandatory privacy webhooks. Copacker copies orders for restock planning and sales figures: order numbers,
// dates, SKUs, quantities, prices, fulfillment status and, when the store allows it, the customer's Shopify ID (to count
// repeat customers). It never stores a customer's name, email address, phone number or address. A data request is
// answered with the stored order details; a redaction removes the customer's ID from their orders. Customer contact
// details in the webhooks are never kept.
export const shopifyComplianceTopics = ["customers/data_request", "customers/redact", "shop/redact"] as const
const orderIds = z.array(z.number().int().positive().safe()).max(1000)
const dataRequest = z.object({
  shop_domain: shopDomainSchema,
  orders_requested: orderIds,
  data_request: z.object({ id: z.number().int().positive().safe() })
})
const shopRedact = z.object({ shop_domain: shopDomainSchema })
const customerRedact = z.object({
  shop_domain: shopDomainSchema,
  customer: z.object({ id: z.number().int().positive().safe() }),
  orders_to_redact: orderIds
})

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
    const input = customerRedact.safeParse(json)
    if (!input.success) {
      return false
    }
    // Only the IDs are kept: the customer's contact details in the webhook are dropped here.
    payload = {
      topic,
      shop: input.data.shop_domain,
      customer: input.data.customer.id,
      orders: input.data.orders_to_redact
    }
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
  z.object({ topic: z.literal("shop/redact"), shop: shopDomainSchema }),
  z.object({
    topic: z.literal("customers/redact"),
    shop: shopDomainSchema,
    customer: z.number().int().positive().safe(),
    orders: orderIds
  })
])

// Worker job: answers a customer data request, or erases a store's data once Shopify says the store is gone.
export async function shopifyComplianceJob(payload: Record<string, unknown>) {
  const input = compliancePayload.parse(payload)
  if (input.topic === "shop/redact") {
    await redactShop(input.shop)
  } else if (input.topic === "customers/redact") {
    await redactCustomer(input.shop, input.customer, input.orders)
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
    .select({ orgId: memberships.orgId, email: memberships.email, locale: profiles.locale })
    .from(memberships)
    .leftJoin(profiles, eq(profiles.userId, memberships.userId))
    .where(and(inArray(memberships.orgId, orgIds), eq(memberships.role, "owner")))
  // Each owner reads the order lines in their own language, as the email job writes the rest of the email.
  const emails = await Promise.all(
    owners.map(async (owner) => {
      const locale = isLocale(owner.locale) ? owner.locale : defaultLocale
      const t = await translatorFor(locale)
      return {
        key: `email:data-request:${requestId}:${owner.orgId}:${owner.email}`,
        kind: "email" as const,
        payload: {
          type: "data_request",
          to: owner.email,
          shop,
          requestId,
          orders: stored
            .filter((row) => row.orgId === owner.orgId)
            .map((row) => describeOrder(t, locale, summarizeSalesOrder("shopify", row.orderedAt, row.data, shop)))
        }
      }
    })
  )
  if (emails.length) {
    await db().insert(jobs).values(emails).onConflictDoNothing()
  }
}

// A Shopify order's status as the sales summary names it, and its key in the email's messages.
const statuses = {
  Unfulfilled: "unfulfilled",
  "Partially fulfilled": "partiallyFulfilled",
  Fulfilled: "fulfilled",
  Cancelled: "cancelled"
} as const

function isStatus(status: string): status is keyof typeof statuses {
  return Object.hasOwn(statuses, status)
}

// "Order #1001, placed 2026-09-01, status Unfulfilled: 2 × CORD-2", in the owner's language.
function describeOrder(
  t: Awaited<ReturnType<typeof translatorFor>>,
  locale: Locale,
  order: ReturnType<typeof summarizeSalesOrder>
) {
  const items = order.items.map((item) =>
    item.sku
      ? t("emails.customerDataRequest.item", { quantity: item.quantity, sku: item.sku })
      : t("emails.customerDataRequest.itemWithoutSku", { quantity: item.quantity })
  )
  return t("emails.customerDataRequest.order", {
    number: order.number,
    date: order.orderedAt.slice(0, 10),
    status: isStatus(order.status) ? t(`emails.customerDataRequest.status.${statuses[order.status]}`) : order.status,
    items: items.length
      ? new Intl.ListFormat(locale, { style: "short", type: "unit" }).format(items)
      : t("emails.customerDataRequest.noItems")
  })
}

// Removes a customer's Shopify ID from the store's copied orders: theirs by customer, and the ones Shopify names.
async function redactCustomer(shop: string, customer: number, orders: number[]) {
  const ids = orders.map((id) => `gid://shopify/Order/${id}`)
  await db()
    .update(salesOrders)
    .set({ data: sql`${salesOrders.data} - 'customerId'` })
    .where(
      and(
        eq(salesOrders.source, "shopify"),
        eq(salesOrders.externalAccountId, shop),
        or(
          sql`${salesOrders.data}->>'customerId' = ${`gid://shopify/Customer/${customer}`}`,
          ids.length ? inArray(salesOrders.orderId, ids) : sql`false`
        )
      )
    )
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
