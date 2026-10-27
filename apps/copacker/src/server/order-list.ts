import type { OrderInput } from "@repo/copacker-orders"
import { money, orderTotal } from "@repo/copacker-orders"
import { orderDestination } from "@repo/copacker-packing-rules"
import { orderNetworks } from "@repo/copacker-shipments/requirements"
import { routeForwarder } from "@repo/copacker-shipments/route"
import { inArray } from "drizzle-orm"
import { db } from "@/db"
import { contacts, shipments } from "@/db/schema"
import type { LogisticsRow } from "@/lib/logistics-list"
import type { visibleOrders } from "@/server/access"
import { localization } from "@/server/localization"
import { requirementTranslator } from "@/server/requirements"
import { withRoutes } from "@/server/shipment-routes"
import { forwarderNames, orderProgress, pendingProposals } from "./logistics-rows"

async function destinations(list: OrderInput[]) {
  const addressIds = [
    ...new Set(
      list.flatMap((data) => (orderDestination(data) !== "amazon" && data.deliveryId ? [data.deliveryId] : []))
    )
  ]
  const text = await requirementTranslator()
  const addresses = addressIds.length
    ? await db().select({ id: contacts.id, name: contacts.name }).from(contacts).where(inArray(contacts.id, addressIds))
    : []
  return (data: OrderInput) =>
    orderDestination(data) === "amazon"
      ? text.amazon(orderNetworks(data))
      : (addresses.find((row) => row.id === data.deliveryId)?.name ?? "—")
}

// The purchase order list's rows, newest first as given: each order's route, how much of it has shipped, and who it
// waits on, from its shipments and any proposal its supplier is waiting to hear about.
export async function orderListRows(
  rows: Array<{
    order: Pick<Awaited<ReturnType<typeof visibleOrders>>[number]["order"], "id" | "data" | "status" | "createdAt">
    supplier: { name: string }
  }>,
  prices: boolean
): Promise<LogisticsRow[]> {
  const ids = rows.map((row) => row.order.id)
  const [destination, { locale }, proposals, forwarder, listed] = await Promise.all([
    destinations(rows.map((row) => row.order.data)),
    localization(),
    pendingProposals(ids),
    forwarderNames(rows.map((row) => row.order.data.via?.forwarderId)),
    ids.length ? db().select().from(shipments).where(inArray(shipments.orderId, ids)) : []
  ])
  // Whether each shipment's route stops at a forwarder, which ships the goods on after the supplier.
  const routed = await withRoutes(
    db(),
    listed,
    (shipment) => rows.find((row) => row.order.id === shipment.orderId)!.order.data
  )
  return rows.map(({ order, supplier }) => ({
    id: order.id,
    href: `/orders/${order.id}`,
    reference: order.data.reference,
    partner: supplier.name,
    forwarder: forwarder(order.data.via?.forwarderId),
    destination: destination(order.data),
    source: "order",
    products: order.data.items.length,
    total: prices ? money(orderTotal(order.data), order.data.currency, locale) : null,
    ...orderProgress(
      order,
      routed
        .filter((shipment) => shipment.orderId === order.id)
        .map((shipment) => ({ ...shipment, forwarder: routeForwarder(shipment.route) !== undefined })),
      proposals.has(order.id)
    )
  }))
}
