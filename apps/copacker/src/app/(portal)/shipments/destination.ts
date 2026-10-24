import { type Address, type OrderInput } from "@repo/copacker-orders"
import { type AmazonNetwork, isAmazonNetwork, orderDestination } from "@repo/copacker-packing-rules"
import { amazonNetworkNames } from "@repo/copacker-shipments"
import { and, eq, inArray } from "drizzle-orm"
import { createTranslator } from "use-intl"
import { formatDestination } from "@/components/common"
import { db } from "@/db"
import { type orders, type shipments, contacts } from "@/db/schema"
import type { ShipmentPlaces } from "@/hooks/use-shipment-route"
import { localization } from "@/server/localization"

type Destination = Pick<OrderInput, "deliveryId" | "items">

// The Amazon network a shipment goes to: its own once it's queued, until then its PO lines', when they all go to one.
export function shipmentNetwork(order: Pick<OrderInput, "items">, network: AmazonNetwork | null) {
  const lines = order.items.flatMap((item) => (isAmazonNetwork(item.receiver) ? [item.receiver] : []))
  const [only, ...others] = network ? [network] : [...new Set(lines)]
  return only && !others.length ? only : undefined
}

// Names where each PO's shipments end up, for the shipments list and a shipment's page: the Amazon network, such as
// Amazon FBA, or the delivery address by name.
export async function shipmentDestinations(orders: Array<Pick<OrderInput, "deliveryId">>) {
  const ids = [...new Set(orders.flatMap((order) => order.deliveryId ?? []))]
  const [config, places] = await Promise.all([
    localization(),
    ids.length
      ? db().select({ id: contacts.id, name: contacts.name }).from(contacts).where(inArray(contacts.id, ids))
      : []
  ])
  const common = createTranslator({ ...config, namespace: "common" })
  return (order: Destination, network: AmazonNetwork | null) => {
    const destination = orderDestination(order)
    if (destination === "amazon") {
      const only = shipmentNetwork(order, network)
      return only ? `Amazon ${amazonNetworkNames[only]}` : "Amazon"
    }
    return places.find((row) => row.id === order.deliveryId)?.name ?? formatDestination(destination, common)
  }
}
// The next delivery stop, resolved within the buyer's workspace after the page's access check.
export async function shipmentDelivery(order: typeof orders.$inferSelect, shipment: typeof shipments.$inferSelect) {
  const data = shipment.snapshot ?? order.data
  if (data.via && !["forwarded", "received"].includes(shipment.status)) {
    const { forwarderAddress } = await import("@/server/forwarders")
    const stop = await forwarderAddress(order.buyerOrgId, data.via.forwarderId, data.via.addressId)
    return { addresses: stop ? [{ ...stop.address, name: stop.forwarderName }] : [], pending: false }
  }
  return finalDestination(order, shipment)
}

// Where the shipment ends up: the buyer's warehouse, or Amazon's once Amazon has the shipment.
async function finalDestination(
  order: typeof orders.$inferSelect,
  shipment: typeof shipments.$inferSelect
): Promise<{ addresses: Address[]; pending: boolean }> {
  const data = shipment.snapshot ?? order.data
  if (orderDestination(data) === "warehouse") {
    const places = data.deliveryId
      ? await db()
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, data.deliveryId), eq(contacts.orgId, order.buyerOrgId)))
      : []
    return { addresses: places.map((place) => ({ ...place.address, name: place.name })), pending: false }
  }
  const amazonShipmentId = shipment.amazonShipmentId ?? shipment.linkedAmazonShipmentId
  if (!amazonShipmentId) {
    return { addresses: [], pending: true }
  }
  try {
    const [{ amazonFor }, { amazonDestinationAddresses }] = await Promise.all([
      import("@/server/connections"),
      import("@/server/amazon-shipments")
    ])
    const api = await amazonFor(order.buyerOrgId, order.amazonSellerId)
    return { addresses: await amazonDestinationAddresses(api, { ...shipment, amazonShipmentId }), pending: false }
  } catch {
    // A provider outage must not prevent packing or invent an address.
    return { addresses: [], pending: false }
  }
}

// Where the shipment's goods stop on their way, for its Route section: the supplier's pickup address, the PO's forwarder,
// AGL when it carries the goods into Amazon, and where they end up, which is the buyer's own warehouse or Amazon's.
export async function shipmentPlaces(
  order: typeof orders.$inferSelect,
  shipment: typeof shipments.$inferSelect,
  { supplier, buyer, pickup }: { supplier: string; buyer: string; pickup?: ShipmentPlaces["pickup"] }
): Promise<ShipmentPlaces> {
  const data = shipment.snapshot ?? order.data
  const { forwarderAddress } = await import("@/server/forwarders")
  const [stop, final] = await Promise.all([
    data.via ? forwarderAddress(order.buyerOrgId, data.via.forwarderId, data.via.addressId) : undefined,
    finalDestination(order, shipment)
  ])
  const warehouse = orderDestination(data) === "warehouse"
  return {
    supplier,
    pickup,
    forwarder: stop && { company: stop.forwarderName, place: { name: stop.addressName, address: stop.address } },
    agl: shipment.transport?.service === "agl",
    destination: {
      company: warehouse ? buyer : "Amazon",
      receiver: warehouse ? "warehouse" : shipmentNetwork(data, shipment.amazonNetwork),
      addresses: final.addresses
    }
  }
}
