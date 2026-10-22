import { type OrderInput } from "@repo/copacker-orders"
import { orderDestination } from "@repo/copacker-packing-rules"
import { amazonNetworkNames } from "@repo/copacker-shipments"
import { inArray } from "drizzle-orm"
import { shipmentDestinations } from "@/app/(portal)/shipments/destination"
import { db } from "@/db"
import { forwarders, orderProposals, type ShipmentState, type shipments } from "@/db/schema"
import type { ListParty, ListStage, LogisticsRow } from "@/lib/logistics-list"
import type { AmazonShipment } from "@/server/amazon-shipments"

type Shipment = Pick<
  typeof shipments.$inferSelect,
  | "id"
  | "orderId"
  | "status"
  | "packing"
  | "packingDraft"
  | "snapshot"
  | "amazonNetwork"
  | "amazonShipmentId"
  | "linkedAmazonShipmentId"
  | "forwarderReference"
  | "bookingReference"
  | "createdAt"
>
// Where a PO goes, read from its lines' receivers, and its stop on the way.
type Route = Pick<OrderInput, "via"> & { items: ReadonlyArray<Pick<OrderInput["items"][number], "receiver">> }

// Who a shipment waits on next: the supplier packs and ships, the buyer approves and buys labels, Amazon creates its
// shipment and receives, a forwarder ships the goods on, and the carrier delivers to the buyer's own location.
export function shipmentParty(status: ShipmentState, route: Route): ListParty {
  switch (status) {
    case "packing":
    case "packed":
    case "correction":
    case "ready":
      return "supplier"
    case "approval":
    case "waiting_labels":
    case "needs_attention":
      return "buyer"
    case "queued":
    case "creating":
      return "amazon"
    case "shipped":
      if (route.via) {
        return "forwarder"
      }
      return orderDestination(route) === "amazon" ? "amazon" : "carrier"
    case "forwarded":
      return orderDestination(route) === "amazon" ? "amazon" : "carrier"
    case "received":
    case "cancelled":
      return "done"
  }
}

export function shipmentStage(status: string): ListStage {
  if (["received", "CLOSED"].includes(status)) {
    return "closed"
  }
  return ["cancelled", "CANCELLED"].includes(status) ? "cancelled" : "active"
}

// An Amazon shipment made in Seller Central: the buyer finishes a working one there, then Amazon has it until it closes.
export function amazonParty(status: string): ListParty {
  if (shipmentStage(status) !== "active") {
    return "done"
  }
  return status === "WORKING" ? "buyer" : "amazon"
}

// The shipment status a purchase order shows while it's with its supplier: the one most in need of someone, so the
// list says what's holding the order up.
const urgency: ShipmentState[] = [
  "needs_attention",
  "approval",
  "waiting_labels",
  "correction",
  "packing",
  "packed",
  "queued",
  "creating",
  "ready",
  "shipped",
  "forwarded",
  "received"
]

const shippedStates: ShipmentState[] = ["shipped", "forwarded", "received"]

// A purchase order's place in the lists. A pending proposal waits on the buyer before anything its shipments need.
export function orderProgress(
  order: {
    status: "draft" | "submitted" | "closed"
    data: Omit<Route, "items"> & { items: ReadonlyArray<Route["items"][number] & { pieces: number }> }
  },
  orderShipments: ReadonlyArray<{
    status: ShipmentState
    snapshot: Route | null
    packing: { cartons: ReadonlyArray<{ items: ReadonlyArray<{ pieces: number }> }> } | null
  }>,
  proposalPending: boolean
): Pick<LogisticsRow, "status" | "stage" | "waiting" | "shipped" | "quantity"> {
  const quantity = order.data.items.reduce((sum, item) => sum + item.pieces, 0)
  const shipped = orderShipments
    .filter((shipment) => shippedStates.includes(shipment.status))
    .flatMap((shipment) => shipment.packing?.cartons ?? [])
    .flatMap((carton) => carton.items)
    .reduce((sum, item) => sum + item.pieces, 0)
  const counts = { shipped: Math.min(shipped, quantity), quantity }
  if (order.status === "draft") {
    return { status: "draft", stage: "draft", waiting: "buyer", ...counts }
  }
  if (order.status === "closed") {
    return { status: "closed", stage: "closed", waiting: "done", ...counts }
  }
  if (proposalPending) {
    return { status: "changes_proposed", stage: "active", waiting: "buyer", ...counts }
  }
  const open = orderShipments.filter((shipment) => shipment.status !== "cancelled")
  const [first] = open.toSorted((a, b) => urgency.indexOf(a.status) - urgency.indexOf(b.status))
  if (!first) {
    return { status: "submitted", stage: "active", waiting: "supplier", ...counts }
  }
  // Pieces not shipped yet wait on the supplier, whoever the shipments on their way wait on. Once every piece is on its
  // way, the order waits on whoever delivers the last shipment, and on nobody once it's received.
  const remaining = shippedStates.includes(first.status) && counts.shipped < quantity
  const waiting = remaining ? "supplier" : shipmentParty(first.status, first.snapshot ?? order.data)
  return { status: first.status, stage: "active", waiting, ...counts }
}

export async function forwarderNames(ids: Array<string | null | undefined>) {
  const wanted = [...new Set(ids.filter((id) => typeof id === "string"))]
  const rows = wanted.length
    ? await db()
        .select({ id: forwarders.id, name: forwarders.name })
        .from(forwarders)
        .where(inArray(forwarders.id, wanted))
    : []
  return (id: string | null | undefined) => rows.find((row) => row.id === id)?.name ?? null
}

export async function pendingProposals(orderIds: string[]) {
  const rows = orderIds.length
    ? await db()
        .select({ orderId: orderProposals.orderId, status: orderProposals.status })
        .from(orderProposals)
        .where(inArray(orderProposals.orderId, orderIds))
    : []
  return new Set(rows.filter((row) => row.status === "pending").map((row) => row.orderId))
}

// A shipment's row. `number` counts its purchase order's shipments, oldest first.
export function shipmentRow(input: {
  shipment: Shipment
  order: { id: string; data: OrderInput }
  number: number
  partner: string
  forwarder: string | null
  destination: string
}): LogisticsRow {
  const { shipment, order, number, partner, forwarder, destination } = input
  const route = shipment.snapshot ?? order.data
  return {
    id: shipment.id,
    href: `/shipments/${shipment.id}`,
    orderHref: `/orders/${order.id}`,
    reference: order.data.reference,
    number,
    detail:
      shipment.amazonShipmentId ??
      shipment.linkedAmazonShipmentId ??
      shipment.forwarderReference ??
      shipment.bookingReference ??
      undefined,
    partner,
    forwarder,
    destination,
    status: shipment.status,
    stage: shipmentStage(shipment.status),
    waiting: shipmentParty(shipment.status, route),
    source: "order",
    cartons: shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0,
    ready: shipment.packingDraft?.readyDate || shipment.packing?.readyDate || null
  }
}

// The shipment list's rows, newest first: every purchase order shipment, then the Amazon shipments that none of them
// already shows. `list` is newest first; `customers` names each order's buyer for a supplier.
export async function shipmentListRows(input: {
  isBuyer: boolean
  rows: Array<{ order: { id: string; data: OrderInput; buyerOrgId: string }; supplier: { name: string } }>
  list: Array<typeof shipments.$inferSelect>
  customers: Array<{ id: string; name: string }>
  amazon: AmazonShipment[]
}): Promise<LogisticsRow[]> {
  const { isBuyer, rows, list, customers, amazon } = input
  const orderOf = (shipment: { orderId: string }) => rows.find((row) => row.order.id === shipment.orderId)
  const [destination, forwarder] = await Promise.all([
    shipmentDestinations(rows.map((row) => row.order.data)),
    forwarderNames(list.map((shipment) => (shipment.snapshot ?? orderOf(shipment)?.order.data)?.via?.forwarderId))
  ])
  const orderRows = list.flatMap((shipment) => {
    const row = orderOf(shipment)
    if (!row) {
      return []
    }
    return [
      shipmentRow({
        shipment,
        order: row.order,
        // A purchase order's shipments are numbered oldest first.
        number:
          list
            .filter((other) => other.orderId === shipment.orderId)
            .toReversed()
            .indexOf(shipment) + 1,
        // Who is on the other side: the supplier for a buyer, the customer for a supplier.
        partner: isBuyer
          ? row.supplier.name
          : (customers.find((customer) => customer.id === row.order.buyerOrgId)?.name ?? "—"),
        forwarder: forwarder((shipment.snapshot ?? row.order.data).via?.forwarderId),
        destination: destination(row.order.data, shipment.amazonNetwork)
      })
    ]
  })
  // An AWD shipment linked from Seller Central keeps its ID apart, so it has a row only once.
  const linked = new Set(
    list.flatMap((shipment) => [
      ...(shipment.amazonShipmentId?.split(", ") ?? []),
      ...(shipment.linkedAmazonShipmentId ? [shipment.linkedAmazonShipmentId] : [])
    ])
  )
  const amazonRows = amazon
    .filter((row) => !linked.has(row.shipmentId))
    .map((row): LogisticsRow => ({
      id: row.shipmentId,
      // Made in Seller Central or elsewhere, so it opens there.
      href: row.url,
      external: true,
      reference: row.shipmentId,
      detail: row.name ?? undefined,
      partner: null,
      forwarder: null,
      destination: `Amazon ${amazonNetworkNames[row.network]}`,
      status: row.status,
      stage: shipmentStage(row.status),
      waiting: amazonParty(row.status),
      source: "amazon",
      ready: null
    }))
  return [...orderRows, ...amazonRows]
}
