import { type AmazonNetwork, amazonNetworkNames, type OrderInput } from "@repo/aisle"
import { eq, inArray } from "drizzle-orm"
import { formatDestination } from "@/components/common"
import { db } from "@/db"
import { contacts, forwarders } from "@/db/schema"

type Destination = Pick<OrderInput, "destination" | "deliveryId" | "items">

// Names where each PO's shipments go, for the shipments list and a shipment's page: the Amazon network, such as Amazon
// FBA, or the delivery address by name, after its forwarder's for a forwarder's address.
export async function shipmentDestinations(orders: Array<Pick<OrderInput, "deliveryId">>) {
  const ids = [...new Set(orders.flatMap((order) => order.deliveryId ?? []))]
  const places = ids.length
    ? await db()
        .select({ id: contacts.id, name: contacts.name, forwarder: forwarders.name })
        .from(contacts)
        .leftJoin(forwarders, eq(forwarders.id, contacts.forwarderId))
        .where(inArray(contacts.id, ids))
    : []
  return (order: Destination, network: AmazonNetwork | null) => {
    if (order.destination === "amazon") {
      // A shipment gets its network when it's queued; until then it's its PO lines', when they all go to one.
      const [only, ...others] = network ? [network] : [...new Set(order.items.map((item) => item.amazonNetwork))]
      return only && !others.length ? `Amazon ${amazonNetworkNames[only]}` : "Amazon"
    }
    const place = places.find((row) => row.id === order.deliveryId)
    return place ? [place.forwarder, place.name].filter(Boolean).join(", ") : formatDestination(order.destination)
  }
}
