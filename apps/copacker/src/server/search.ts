import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { isPresent } from "ts-extras"
import { db } from "@/db"
import { connections, forwarders, orders, shipments, stockSnapshots, supplierProfiles, suppliers } from "@/db/schema"
import { can } from "@/lib/access"
import { forwarderOrders, orderVisibleTo } from "./access"
import type { Session } from "./auth"
import { isCollective } from "./inventory-products"
import { stockScopes } from "./stock"
import { serverText } from "./text"

export type SearchOrder = {
  id: string
  reference: string
  supplier: string
  status: string
  // The Amazon shipment and AWD order IDs of its shipments, so searching for one finds its PO.
  amazonIds: string[]
}

export type SearchShipment = {
  id: string
  // Named as its page names it: by its Amazon shipment ID, or its place among its PO's shipments.
  title: string
  reference: string
  status: string
  // Its PO, Amazon IDs, booking reference and the forwarder's tracking, which searching matches too.
  keywords: string[]
}

export type SearchProduct = {
  id: string
  title: string
  imageUrl: string | null
  // Its variations' names and SKUs, which searching matches too.
  keywords: string[]
}

export type SearchPartner = {
  id: string
  name: string
  type: "supplier" | "forwarder"
  // A supplier's legal name in Shopify and its contact's name, which searching matches too.
  keywords: string[]
}

export type SearchIndex = {
  orders: SearchOrder[]
  shipments: SearchShipment[]
  products: SearchProduct[]
  partners: SearchPartner[]
}

// What the app header's search looks through, as the pages listing them show them: the workspace's POs and shipments,
// newest first, and a buyer's products and partners, each only for someone who can open its page. The browser matches
// them as the person types; sales orders are searched on the server instead, as the Orders page searches them.
export async function searchIndex(s: Session): Promise<SearchIndex> {
  const buyer = s.org.kind === "buyer"
  const [purchasing, products, partners] = await Promise.all([
    can(s, "orders") || can(s, "shipments") ? searchPurchasing(s) : { orders: [], shipments: [] },
    buyer && can(s, "products") ? searchProducts(s.org.id) : [],
    buyer && can(s, "partners") ? searchPartners(s.org.id) : []
  ])
  return {
    orders: can(s, "orders") ? purchasing.orders : [],
    shipments: can(s, "shipments") ? purchasing.shipments : [],
    products,
    partners
  }
}

async function searchPurchasing(s: Session): Promise<Pick<SearchIndex, "orders" | "shipments">> {
  // A forwarder opens the POs routed through it, but not their shipments' pages.
  if (s.org.kind === "forwarder") {
    const rows = await forwarderOrders(s)
    return {
      orders: rows.toReversed().map(({ order, supplier }) => ({
        id: order.id,
        reference: order.data.reference,
        supplier: supplier.name,
        status: order.status,
        amazonIds: []
      })),
      shipments: []
    }
  }
  const rows = await db()
    .select({
      id: orders.id,
      reference: sql<string>`${orders.data}->>'reference'`,
      supplier: suppliers.name,
      status: orders.status
    })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(orderVisibleTo(s))
    .orderBy(desc(orders.createdAt))
  const shipmentRows = rows.length
    ? await db()
        .select({
          id: shipments.id,
          orderId: shipments.orderId,
          status: shipments.status,
          amazonShipmentId: shipments.amazonShipmentId,
          awdOrderId: shipments.amazonOrderId,
          bookingReference: shipments.bookingReference,
          tracking: shipments.forwarderReference
        })
        .from(shipments)
        .where(
          inArray(
            shipments.orderId,
            rows.map((row) => row.id)
          )
        )
        .orderBy(shipments.createdAt)
    : []
  const amazonIds = (shipment: (typeof shipmentRows)[number]) =>
    [shipment.amazonShipmentId, shipment.awdOrderId].filter(isPresent)
  const references = new Map(rows.map((row) => [row.id, row.reference]))
  return {
    orders: rows.map((row) => ({
      ...row,
      amazonIds: shipmentRows.flatMap((shipment) => (shipment.orderId === row.id ? amazonIds(shipment) : []))
    })),
    // A PO's shipments are numbered oldest first, as their pages number them; the newest are listed first.
    shipments: shipmentRows
      .map((shipment) => {
        const reference = references.get(shipment.orderId) ?? ""
        const number = shipmentRows.filter((row) => row.orderId === shipment.orderId).indexOf(shipment) + 1
        const title = shipment.amazonShipmentId ?? `Shipment ${number}`
        return {
          id: shipment.id,
          title,
          reference,
          status: shipment.status,
          keywords: [
            ...new Set(
              [title, reference, ...amazonIds(shipment), shipment.bookingReference, shipment.tracking].filter(isPresent)
            )
          ]
        }
      })
      .toReversed()
  }
}

// The buyer's Shopify products as the Products page lists them: one per product, titled the same way, and without
// Shopify Collective items, which partners stock.
async function searchProducts(orgId: string): Promise<SearchProduct[]> {
  const { provider, scopeKey } = stockScopes.shopify
  const [current] = await db()
    .select({ data: stockSnapshots.data })
    .from(connections)
    .innerJoin(
      stockSnapshots,
      and(
        eq(stockSnapshots.orgId, connections.orgId),
        eq(stockSnapshots.externalAccountId, connections.externalId),
        eq(stockSnapshots.source, "shopify"),
        eq(stockSnapshots.scopeKey, scopeKey)
      )
    )
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, provider)))
  const rows = current?.data?.source === "shopify" ? current.data.rows : []
  const t = await serverText()
  const products = new Map<string, SearchProduct>()
  for (const row of rows) {
    if (isCollective(row)) {
      continue
    }
    const id = row.productId ?? row.variantId
    const product = products.get(id) ?? {
      id,
      title: row.productTitle ?? row.buyerSku ?? t("untitledProduct"),
      imageUrl: null,
      keywords: []
    }
    product.imageUrl ??= row.imageUrl ?? null
    product.keywords.push(
      ...[row.variantTitle === "Default Title" ? null : row.variantTitle, row.buyerSku].filter(isPresent)
    )
    products.set(id, product)
  }
  return [...products.values()].toSorted((a, b) => a.title.localeCompare(b.title))
}

// The buyer's current suppliers and forwarders, by name. A supplier's contact is the buyer's until it joins, then its
// own.
async function searchPartners(orgId: string): Promise<SearchPartner[]> {
  const [supplierRows, forwarderRows] = await Promise.all([
    db()
      .select({
        id: suppliers.id,
        name: suppliers.name,
        legalName: suppliers.shopifySupplierName,
        contactName: sql<
          string | null
        >`case when ${suppliers.supplierOrgId} is null then ${suppliers.contactName} else ${supplierProfiles.contactName} end`
      })
      .from(suppliers)
      .leftJoin(supplierProfiles, eq(supplierProfiles.orgId, suppliers.supplierOrgId))
      .where(and(eq(suppliers.buyerOrgId, orgId), isNull(suppliers.removedAt))),
    db()
      .select({ id: forwarders.id, name: forwarders.name })
      .from(forwarders)
      .where(and(eq(forwarders.buyerOrgId, orgId), isNull(forwarders.removedAt)))
  ])
  return [
    ...supplierRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: "supplier" as const,
      keywords: [row.legalName, row.contactName].filter(isPresent)
    })),
    ...forwarderRows.map((row) => ({ id: row.id, name: row.name, type: "forwarder" as const, keywords: [] }))
  ].toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
}
