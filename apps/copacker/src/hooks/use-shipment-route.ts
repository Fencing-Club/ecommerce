import { type Address, addressLine } from "@repo/copacker-orders"
import { isAmazonNetwork, type ReceiverId, type Route } from "@repo/copacker-packing-rules"
import { useTranslations } from "use-intl"
import type { RouteStop } from "@/components/route-editor"

// A place on the route: its name, such as "Main factory", and its address.
type Place = { name?: string; address: Partial<Address> }

// Where a shipment's goods stop on their way, as the shipment page loads them: the supplier's pickup address, the
// purchase order's forwarder, whether AGL carries them into Amazon, and where they end up, with the addresses known so
// far (the buyer's warehouse, or Amazon's once it names them).
export type ShipmentPlaces = {
  supplier: string
  pickup?: Place
  forwarder?: { company: string; place: Place }
  agl: boolean
  destination: { company: string; receiver?: ReceiverId; addresses: Address[] }
}

// A place on one line, its name first: "Main factory, 1000 Siji Road, Yiwu, Zhejiang 322000, CN".
const placeLine = ({ name, address }: Place) => [name, addressLine(address)].filter(Boolean).join(", ") || undefined

// The shipment's route as the Route section shows it, each stop named by its company with its place under it. Who moves
// each leg isn't kept with the shipment yet, so the route has no legs and the section shows the transport under it.
export function useShipmentRoute({ supplier, pickup, forwarder, agl, destination }: ShipmentPlaces): Route<RouteStop> {
  const t = useTranslations("shipments.route")
  const network = isAmazonNetwork(destination.receiver) ? destination.receiver : undefined
  const addresses = destination.addresses.map((address) => placeLine({ name: address.name, address }))
  const stops: RouteStop[] = [
    {
      id: "supplier",
      company: supplier,
      kind: "supplier",
      name: supplier,
      detail: pickup && placeLine(pickup),
      // Who to call about the pickup.
      contact: pickup && {
        name: pickup.address.name,
        phone: pickup.address.phoneNumber,
        countryCode: pickup.address.countryCode
      }
    },
    ...(forwarder
      ? [
          {
            id: "forwarder",
            company: forwarder.company,
            kind: "forwarder" as const,
            name: forwarder.company,
            detail: placeLine(forwarder.place)
          }
        ]
      : []),
    ...(agl
      ? [
          {
            id: "agl",
            company: "Amazon",
            kind: "agl" as const,
            name: t("stops.agl.name"),
            detail: t("stops.agl.detail")
          }
        ]
      : []),
    {
      id: "destination",
      company: destination.company,
      kind: "receiver",
      receiver: destination.receiver,
      name: network ? t(`networks.${network}.name`) : destination.company,
      // Amazon names its warehouses only once it has the shipment; until then, when it does.
      detail: addresses.length ? addresses.join("; ") : network && t(`stops.${network}`)
    }
  ]
  return { stops, legs: [] }
}
