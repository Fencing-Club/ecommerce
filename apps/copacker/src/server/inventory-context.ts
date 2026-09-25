import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { connections, contacts, inventoryLocationMappings, orders, shipments, stockSnapshots } from "@/db/schema"
import { locationClassifications } from "./inventory-locations"
import { onOrderByVariant } from "./inventory-products"
import { receivedPieces } from "./readiness"
import { stockScopes } from "./stock"

// Everything the Inventory page and restock read for a buyer: the Shopify snapshot, how each location counts, and
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
    classifications,
    new Map(deliveries.map((contact) => [contact.id, contact.locationId]))
  )
  return { domain: current?.domain ?? null, data, rows: data?.rows ?? [], classifications, onOrder }
}
