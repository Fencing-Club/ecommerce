import type { AmazonNetwork } from "@repo/aisle"
import { amazonNetworkNames, type OrderInput } from "@repo/aisle"
import { inArray } from "drizzle-orm"
import { createTranslator } from "use-intl"
import { formatDestination } from "@/components/common"
import { db } from "@/db"
import { contacts } from "@/db/schema"
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

// A ready date, a calendar day such as "2026-09-27", as "Sep 27" in the viewer's language.
export const readyDateFormat = { month: "short", day: "numeric", timeZone: "UTC" } as const
