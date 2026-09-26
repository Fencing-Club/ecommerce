import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { connections, contacts, inventoryLocationMappings, orders, shipments, stockSnapshots } from "@/db/schema"
import { locationClassifications } from "./inventory-locations"
import { amazonPools, onOrderByVariant, withAmazonStock } from "./inventory-products"
import { receivedPieces } from "./readiness"
import { stockScopes } from "./stock"

// Everything the Products page and restock read for a buyer: the Shopify snapshot, how each location counts, and
// what's on order where.
export async function inventoryContext(orgId: string) {
  const { scopeKey, provider } = stockScopes.shopify
  const [current] = await db()
    .select({ domain: connections.externalId, stock: stockSnapshots })
    .from(connections)
    .leftJoin(
      stockSnapshots,
      and(
        eq(stockSnapshots.orgId, connections.orgId),
        eq(stockSnapshots.externalAccountId, connections.externalId),
        eq(stockSnapshots.source, "shopify"),
        eq(stockSnapshots.scopeKey, scopeKey)
      )
    )
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, provider)))
  const data = current?.stock?.data?.source === "shopify" ? current.stock.data : null
  const saved = current
    ? await db()
        .select()
        .from(inventoryLocationMappings)
        .where(
          and(eq(inventoryLocationMappings.orgId, orgId), eq(inventoryLocationMappings.shopifyDomain, current.domain))
        )
    : []
  const classifications = locationClassifications(data, saved)
  // Sent POs only: drafts haven't been ordered, and closed POs have arrived or been cancelled.
  const sentOrders = await db()
    .select({ id: orders.id, data: orders.data })
    .from(orders)
    .where(and(eq(orders.buyerOrgId, orgId), eq(orders.status, "submitted")))
  const sentShipments = sentOrders.length
    ? await db()
        .select()
        .from(shipments)
        .where(
          inArray(
            shipments.orderId,
            sentOrders.map((order) => order.id)
          )
        )
    : []
  const deliveries = await db()
    .select({ id: contacts.id, locationId: contacts.shopifyLocationId })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.kind, "delivery")))
  const onOrder = onOrderByVariant(
    sentOrders.map((order) => ({
      ...order,
      received: receivedPieces(sentShipments.filter((shipment) => shipment.orderId === order.id))
    })),
    new Map(deliveries.map((contact) => [contact.id, contact.locationId]))
  )
  // Amazon's FBA and AWD stock, added to the Shopify variants they match by SKU.
  const [amazon] = await db()
    .select({ sellerId: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "amazon")))
  const amazonSnapshots = amazon
    ? await db()
        .select({ data: stockSnapshots.data })
        .from(stockSnapshots)
        .where(
          and(
            eq(stockSnapshots.orgId, orgId),
            eq(stockSnapshots.externalAccountId, amazon.sellerId),
            inArray(stockSnapshots.source, ["fba", "awd"])
          )
        )
    : []
  const fba = amazonSnapshots.flatMap((row) => (row.data?.source === "fba" ? row.data.rows : []))
  const awd = amazonSnapshots.flatMap((row) => (row.data?.source === "awd" ? row.data.rows : []))
  const rows = data?.rows ?? []
  const pooled = withAmazonStock(rows, fba, awd)
  const withPools = new Map(classifications)
  withPools.set(amazonPools.fba.id, "merchant")
  withPools.set(amazonPools.awd.id, "merchant")
  return {
    domain: current?.domain ?? null,
    data,
    rows,
    classifications,
    onOrder,
    // Shopify rows with Amazon's pools added, counted alongside the store's own locations.
    inventoryRows: pooled.rows,
    inventoryClassifications: withPools,
    amazonOnly: pooled.amazonOnly,
    // Amazon's own rows, for restocking Amazon; null until that pool has synced.
    fbaRows: amazonSnapshots.some((row) => row.data?.source === "fba") ? fba : null,
    awdRows: amazonSnapshots.some((row) => row.data?.source === "awd") ? awd : null
  }
}
