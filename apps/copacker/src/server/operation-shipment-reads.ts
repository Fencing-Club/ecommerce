import { shipmentReadOperations, type metaSchema } from "@repo/copacker-contract"
import { orderDestination } from "@repo/copacker-packing-rules"
import { routeForwarder } from "@repo/copacker-shipments/route"
import { and, eq, inArray } from "drizzle-orm"
import type { z } from "zod"
import { db } from "@/db"
import { connections, shipments } from "@/db/schema"
import { forwarderOrders, visibleOrders } from "./access"
import { amazonShipmentLinks } from "./amazon-shipments"
import { routedThrough, withRoutes } from "./shipment-routes"
import { amazonShipments } from "./shipments-page"
import type { Session } from "./workspace-session"

export async function readShipments(s: Session, includeExternal: boolean) {
  type Row = z.infer<(typeof shipmentReadOperations)["shipment.show"]["output"]>
  const forwarded = s.org.kind === "forwarder" ? await forwarderOrders(s) : []
  const orders = s.org.kind === "forwarder" ? forwarded : await visibleOrders(s)
  const byId = new Map(orders.map(({ order }) => [order.id, order]))
  // The forwarder each order was found by, whose workspace sees only the shipments routed through it.
  const forwarderOf = new Map(forwarded.map((row) => [row.order.id, row.forwarder.id]))
  const routed = await withRoutes(
    db(),
    byId.size
      ? await db()
          .select()
          .from(shipments)
          .where(inArray(shipments.orderId, [...byId.keys()]))
      : [],
    (row) => byId.get(row.orderId)!.data
  )
  const stored = routed.filter((row) => {
    const forwarderId = forwarderOf.get(row.orderId)
    return !forwarderId || routedThrough(forwarderId)(row)
  })
  const items: Row[] = stored.map((row) => {
    const po = byId.get(row.orderId)!
    const ids = new Set(amazonShipmentLinks(row).map((link) => link.id))
    if (row.linkedAmazonShipmentId) {
      ids.add(row.linkedAmazonShipmentId)
    }
    return {
      id: row.id,
      origin: "copacker",
      poId: row.orderId,
      revision: row.revision,
      poRevision: row.orderRevision,
      state: row.status,
      reference: po.data.reference,
      providerReferences:
        po.amazonSellerId && row.amazonNetwork
          ? [...ids].map((externalId) => ({
              provider: "amazon",
              accountId: po.amazonSellerId!,
              network: row.amazonNetwork!,
              externalId
            }))
          : [],
      route: {
        supplierId: po.supplierId,
        forwarderId: routeForwarder(row.route)?.forwarderId ?? null,
        deliveryId: po.data.deliveryId ?? null,
        destination: orderDestination(po.data)
      },
      bookingReference: row.bookingReference,
      forwarderCarrier: row.forwarderCarrier,
      forwarderReference: row.forwarderReference,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      allowedActions: ["shipment.show"]
    }
  })
  const metadata: Partial<z.infer<typeof metaSchema>> = {}
  if (s.org.kind === "buyer" && includeExternal) {
    const [account] = await db()
      .select({ id: connections.id, accountId: connections.externalId, revision: connections.revision })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "amazon")))
    if (account) {
      try {
        const external = await amazonShipments(s.org.id)
        const [current] = await db()
          .select({ accountId: connections.externalId, revision: connections.revision })
          .from(connections)
          .where(and(eq(connections.orgId, s.org.id), eq(connections.id, account.id)))
        if (!current || current.accountId !== account.accountId || current.revision !== account.revision) {
          throw new Error("Connection changed")
        }
        const linked = new Set(
          items.flatMap((row) =>
            row.providerReferences
              .filter((ref) => ref.accountId === account.accountId)
              .map((ref) => `${ref.network}:${ref.externalId}`)
          )
        )
        for (const row of external ?? []) {
          if (!linked.has(`${row.network}:${row.shipmentId}`)) {
            items.push({
              id: null,
              origin: "external",
              poId: null,
              revision: null,
              poRevision: null,
              state: row.status,
              reference: row.name,
              providerReferences: [
                { provider: "amazon", accountId: account.accountId, network: row.network, externalId: row.shipmentId }
              ],
              route: null,
              bookingReference: null,
              forwarderCarrier: null,
              forwarderReference: null,
              createdAt: row.createdAt,
              updatedAt: null,
              allowedActions: []
            })
          }
        }
        metadata.sources = [
          {
            provider: "amazon",
            accountId: account.accountId,
            dataset: "inbound_shipments",
            observedAt: null,
            freshness: "unknown",
            availability: "available",
            staleAfter: null
          }
        ]
      } catch {
        metadata.completeness = "partial"
        metadata.warnings = [
          {
            code: "provider_unavailable",
            path: [],
            message: "Amazon inbound shipments could not be read; Copacker shipments are still returned."
          }
        ]
      }
    }
  }
  return { items, metadata }
}
