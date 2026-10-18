import type { AmazonNetwork } from "@repo/aisle"
import { amazonNetworkNames, type OrderInput } from "@repo/aisle"
import { and, eq, inArray } from "drizzle-orm"
import { createTranslator } from "use-intl"
import { formatDestination } from "@/components/common"
import { db } from "@/db"
import { type orders, type shipments, contacts } from "@/db/schema"
import { localization } from "@/server/localization"

type Destination = Pick<OrderInput, "destination" | "deliveryId" | "items">

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
    if (order.destination === "amazon") {
      // A shipment gets its network when it's queued; until then it's its PO lines', when they all go to one.
      const [only, ...others] = network ? [network] : [...new Set(order.items.map((item) => item.amazonNetwork))]
      return only && !others.length ? `Amazon ${amazonNetworkNames[only]}` : "Amazon"
    }
    return places.find((row) => row.id === order.deliveryId)?.name ?? formatDestination(order.destination, common)
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
  if (data.destination === "warehouse") {
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
