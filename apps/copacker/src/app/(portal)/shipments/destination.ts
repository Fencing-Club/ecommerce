import { type Address, type OrderInput } from "@repo/copacker-orders"
import { type AmazonNetwork, isAmazonNetwork, orderDestination } from "@repo/copacker-packing-rules"
import { amazonNetworkNames } from "@repo/copacker-shipments"
import { followedRoute, routeForwarder, type ShipmentRoute, shipmentReceiver } from "@repo/copacker-shipments/route"
import { and, eq, inArray } from "drizzle-orm"
import { createTranslator } from "use-intl"
import { formatDestination } from "@/components/common"
import { db } from "@/db"
import { type orders, type shipments, contacts } from "@/db/schema"
import type { ShipmentPlaces } from "@/hooks/use-shipment-route"
import type { ForwarderAddress } from "@/server/forwarders"
import { localization } from "@/server/localization"
import { stopForwarders } from "@/server/shipment-routes"

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
// The next delivery stop, resolved within the buyer's workspace after the page's access check: the forwarder the
// shipment's route stops at until it ships the goods on, then where they end up.
export async function shipmentDelivery(
  order: typeof orders.$inferSelect,
  shipment: typeof shipments.$inferSelect & { route: ShipmentRoute }
) {
  const via = routeForwarder(shipment.route)
  if (via && !["forwarded", "received"].includes(shipment.status)) {
    const { forwarderAddress } = await import("@/server/forwarders")
    const stop = await forwarderAddress(order.buyerOrgId, via.forwarderId, via.addressId)
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

// What a shipment's Route section is made from, as the database and Amazon give it: the forwarder addresses its route
// stops at, and with `offer`, for whoever edits the route, each of the buyer's current forwarder addresses it can stop
// at instead; and where the goods end up.
export async function shipmentPlaceRows(
  order: typeof orders.$inferSelect,
  shipment: typeof shipments.$inferSelect,
  saved: ShipmentRoute | undefined,
  offer: boolean
) {
  const data = shipment.snapshot ?? order.data
  const { forwarderAddresses } = await import("@/server/forwarders")
  const stops = [
    ...(data.via ? [data.via] : []),
    ...(saved?.stops ?? []).flatMap((stop) => (stop.kind === "forwarder" ? [stop] : []))
  ]
  const [named, current, final] = await Promise.all([
    stopForwarders(stops),
    offer ? forwarderAddresses(order.buyerOrgId) : [],
    finalDestination(order, shipment)
  ])
  const same = (a: { forwarderId: string; addressId: string }) => (b: typeof a) =>
    a.forwarderId === b.forwarderId && a.addressId === b.addressId
  // The route's own stops are named whether or not the buyer still keeps them; only a current address is offered.
  const forwarders = [
    ...named.map((row) => ({ ...row, offered: current.some(same(row)) })),
    ...current.filter((row) => !named.some(same(row))).map((row) => ({ ...row, offered: true }))
  ]
  return { forwarders, finalAddresses: final.addresses }
}

// Where the shipment's goods stop on their way, for its Route section: its saved route, or until it saves one, its PO's;
// the supplier's pickup address; the forwarder addresses the route stops at or can (`offered`); and where the goods end
// up, which is the buyer's own warehouse or Amazon's.
export function shipmentPlaces(
  data: OrderInput,
  shipment: Pick<typeof shipments.$inferSelect, "amazonNetwork">,
  {
    saved,
    supplier,
    buyer,
    pickup,
    forwarders,
    finalAddresses
  }: {
    saved?: ShipmentRoute
    supplier: string
    buyer: string
    pickup?: ShipmentPlaces["pickup"]
    forwarders: Array<
      Pick<ForwarderAddress, "forwarderId" | "forwarderName" | "addressId" | "addressName" | "address"> & {
        offered: boolean
      }
    >
    finalAddresses: Address[]
  }
): ShipmentPlaces {
  const warehouse = orderDestination(data) === "warehouse"
  return {
    route: saved ?? followedRoute(data, forwarders),
    supplier,
    pickup,
    forwarders: forwarders.map((row) => ({
      forwarderId: row.forwarderId,
      addressId: row.addressId,
      company: row.forwarderName,
      place: { name: row.addressName, address: row.address },
      offered: row.offered
    })),
    destination: {
      company: warehouse ? buyer : "Amazon",
      receiver: shipmentReceiver(data, shipment.amazonNetwork),
      network: warehouse ? undefined : shipmentNetwork(data, shipment.amazonNetwork),
      addresses: finalAddresses
    }
  }
}
