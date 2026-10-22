import { orderDestination } from "@repo/copacker-packing-rules"
import { releasedStates } from "@repo/copacker-shipments/states"
import { and, asc, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { contacts, documents, shipments } from "@/db/schema"
import { releasedLabelKinds } from "@/lib/shipment-states"
import type { forwarderOrders } from "@/server/access"
import { serverTranslator } from "@/server/translation"
import { unpricedOrder } from "./prices"
// The products table runs edge to edge in its card, its first and last columns in line with the route above it and
// with the other cards' content.

// The shipping documents a forwarder gets, in the order they're made, as the purchase order page lists them.
const documentOrder: Array<(typeof documents.$inferSelect)["kind"]> = [
  "invoice",
  "packing_list",
  "carton_label",
  "pallet_label",
  "shipping_label"
]

// What a freight forwarder sees of a PO whose goods pass through it: the route, with the address to ship on to when
// that's the buyer's own location, what's coming and in how many cartons, and the shipping documents. No prices; the
// commercial invoice carries what customs needs. The cards are the buyer's purchase order page's, less its costs and
// history.

export async function forwarderPage(row: Awaited<ReturnType<typeof forwarderOrders>>[number], editable: boolean) {
  const { order, supplier, forwarder } = row
  const [shipmentRows, docs, t] = await Promise.all([
    db().select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(asc(shipments.createdAt)),
    db()
      .select()
      .from(documents)
      .where(
        and(eq(documents.orderId, order.id), eq(documents.outdated, false), inArray(documents.kind, documentOrder))
      ),
    serverTranslator("orders")
  ])
  const addressIds = [order.data.deliveryId, order.data.via?.addressId].filter((value) => value !== undefined)
  const places = addressIds.length
    ? await db()
        .select({ id: contacts.id, name: contacts.name, address: contacts.address })
        .from(contacts)
        .where(inArray(contacts.id, addressIds))
    : []

  // The buyer's location the forwarder ships the goods on to, when they don't go on to Amazon.
  const onward =
    orderDestination(order.data) === "warehouse"
      ? places.find((candidate) => candidate.id === order.data.deliveryId)
      : undefined
  // Carton, pallet and shipping labels come once the buyer releases the shipment, as for the supplier.
  const visible = docs.filter((doc) => {
    if (!releasedLabelKinds.includes(doc.kind)) {
      return true
    }
    const shipment = shipmentRows.find((candidate) => candidate.id === doc.shipmentId)
    return !!shipment && releasedStates.includes(shipment.status) && shipment.revision === doc.shipmentRevision
  })
  // The purchase order's own documents, then each shipment's under its name, as the purchase order page groups them.
  const documentGroups = [
    { key: "order", title: null, shipmentId: null },
    ...shipmentRows.map((shipment, index) => ({
      key: shipment.id,
      title: t("detail.shipment", { number: index + 1 }),
      shipmentId: shipment.id
    }))
  ].flatMap((group) => {
    const grouped = visible
      .filter((doc) => doc.shipmentId === group.shipmentId)
      .toSorted(
        (a, b) =>
          documentOrder.indexOf(a.kind) - documentOrder.indexOf(b.kind) ||
          (a.cartonId ?? a.name).localeCompare(b.cartonId ?? b.name, undefined, { numeric: true })
      )
    return grouped.length ? [{ ...group, documents: grouped }] : []
  })

  return {
    editable,
    order: { status: order.status, data: unpricedOrder(order.data) },
    supplier: { name: supplier.name },
    forwarder: { name: forwarder.name },
    places,
    onward,
    shipmentRows: shipmentRows.map((shipment) => ({
      id: shipment.id,
      status: shipment.status,
      amazonNetwork: shipment.amazonNetwork,
      cartonCount: shipment.packing?.cartons.length ?? 0,
      forwarderCarrier: shipment.forwarderCarrier,
      forwarderReference: shipment.forwarderReference
    })),
    documentGroups: documentGroups.map((group) => ({
      ...group,
      documents: group.documents.map((doc) => ({ id: doc.id, name: doc.name, kind: doc.kind, cartonId: doc.cartonId }))
    }))
  }
}
