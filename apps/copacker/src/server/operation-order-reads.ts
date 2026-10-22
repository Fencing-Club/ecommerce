import { orderReadOperations, type metaSchema } from "@repo/copacker-contract"
import { and, eq, gte, lte, or, sql } from "drizzle-orm"
import type { z } from "zod"
import { db } from "@/db"
import { connections, salesOrders } from "@/db/schema"
import { can } from "@/lib/access"
import { CliError } from "./cli-auth"
import { summarizeSalesOrder } from "./sales-orders"
import { excludedShopifyTags, taggedWith } from "./shopify-tags"
import type { Session } from "./workspace-session"

type Filter = {
  id?: string
  reference?: string
  connectionId?: string
  provider?: "shopify" | "amazon" | "ebay"
  from?: string
  to?: string
}
export async function readCustomerOrders(s: Session, filter: Filter) {
  const excluded = await excludedShopifyTags(s.org.id)
  const rows = await db()
    .select({ row: salesOrders, connectionId: connections.id })
    .from(salesOrders)
    .innerJoin(
      connections,
      and(
        eq(connections.orgId, salesOrders.orgId),
        eq(connections.provider, salesOrders.source),
        eq(connections.externalId, salesOrders.externalAccountId)
      )
    )
    .where(
      and(
        eq(salesOrders.orgId, s.org.id),
        filter.id ? eq(salesOrders.id, filter.id) : undefined,
        filter.reference
          ? or(
              eq(salesOrders.orderId, filter.reference),
              sql`${salesOrders.data}->>'name' = ${filter.reference}`,
              sql`${salesOrders.data}->>'salesRecordReference' = ${filter.reference}`
            )
          : undefined,
        filter.connectionId ? eq(connections.id, filter.connectionId) : undefined,
        filter.provider ? eq(connections.provider, filter.provider) : undefined,
        filter.from ? gte(salesOrders.orderedAt, new Date(`${filter.from}T00:00:00Z`)) : undefined,
        filter.to ? lte(salesOrders.orderedAt, new Date(`${filter.to}T23:59:59.999Z`)) : undefined,
        sql`(${salesOrders.source} <> 'shopify' or not ${taggedWith(sql`${salesOrders.data}`, excluded)})`
      )
    )
    .orderBy(salesOrders.orderedAt, salesOrders.id)
    .limit(10001)
  if (rows.length > 10000) {
    throw new CliError(
      "result_too_large",
      "Select a narrower order date range or connection (maximum 10,000 orders).",
      413
    )
  }
  const prices = can(s, "prices")
  const coverageIssues = [
    {
      code: "order_summary",
      message: "Stored order summaries do not include full fulfillment, refund, payment-status or line-price evidence.",
      path: []
    }
  ]
  const items: z.infer<(typeof orderReadOperations)["order.show"]["output"]>[] = rows.map(({ row, connectionId }) => {
    const summary = summarizeSalesOrder(row.source, row.orderedAt, row.data, row.externalAccountId)
    return {
      id: row.id,
      source: { connectionId, provider: row.source, accountId: row.externalAccountId, externalId: row.orderId },
      reference: summary.number,
      createdAt: summary.orderedAt,
      observedAt: row.syncedAt.toISOString(),
      status: summary.status,
      channel: summary.channel,
      items: summary.items.map((item) => ({
        sku: item.sku,
        sourceVariantId: item.variantId ?? null,
        title: item.name ?? null,
        quantity: item.quantity,
        unit: "source_order_unit"
      })),
      netProductSales:
        prices && summary.sales ? { amountMinor: summary.sales.minor, currency: summary.sales.currency } : null,
      coverageIssues
    }
  })
  const metadata: Partial<z.infer<typeof metaSchema>> = {
    completeness: "partial",
    sources: [],
    warnings: coverageIssues,
    redactedFields: prices ? [] : ["netProductSales"]
  }
  return { items, metadata }
}
