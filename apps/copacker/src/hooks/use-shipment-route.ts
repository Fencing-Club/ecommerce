import type { Address } from "@repo/copacker-orders"
import { type AmazonNetwork, type ReceiverId, type Route } from "@repo/copacker-packing-rules"
import { type SavedStop, type ShipmentRoute, stopId } from "@repo/copacker-shipments/route"
import { useTranslations } from "use-intl"
import type { RouteChoices, RoutePlace, RouteStop } from "@/components/route-editor"

// A place on the route: its name, such as "Main factory", and its address.
type Place = Omit<RoutePlace, "contact">

// A forwarder's address the route stops at, or can.
export type ForwarderPlace = { forwarderId: string; addressId: string; company: string; place: Place }

// Where a shipment's goods stop on their way, as the shipment page loads them: its route, and the places its stops are.
// The supplier's pickup address, the forwarder addresses the route stops at or can (the purchase order's, `via`), and
// where the goods end up, with the addresses known so far (the buyer's warehouse, or Amazon's once it names them).
// `receiver` is where the route rules take the goods; `network` names the Amazon network once the shipment has one.
export type ShipmentPlaces = {
  route: ShipmentRoute
  supplier: string
  pickup?: Place
  forwarders: ForwarderPlace[]
  via?: { forwarderId: string; addressId: string }
  destination: { company: string; receiver: ReceiverId; network?: AmazonNetwork; addresses: Address[] }
}

// The shipment's route as the Route section shows and edits it, each stop named by its company with its place under it;
// the stops it can choose from: the purchase order's forwarder, AGL on the way into Amazon, and where the goods end up;
// and `saved`, which turns an edited route back into the stops the shipment keeps.
export function useShipmentRoute({ route, supplier, pickup, forwarders, via, destination }: ShipmentPlaces) {
  const t = useTranslations("shipments.route")
  const amazon = destination.receiver !== "warehouse"
  const forwarderStop = (place: ForwarderPlace): RouteStop & { saved: SavedStop } => {
    const saved = { kind: "forwarder" as const, forwarderId: place.forwarderId, addressId: place.addressId }
    return {
      id: stopId(saved),
      company: place.company,
      kind: "forwarder",
      name: place.company,
      places: [place.place],
      saved
    }
  }
  const places: Array<RouteStop & { saved: SavedStop }> = [
    {
      id: "supplier",
      company: supplier,
      kind: "supplier",
      name: supplier,
      // With who to call about the pickup.
      places: pickup && [{ ...pickup, contact: true }],
      saved: { kind: "supplier" }
    },
    ...forwarders.map(forwarderStop),
    {
      id: "agl",
      company: "Amazon",
      kind: "agl",
      name: t("stops.agl.name"),
      detail: t("stops.agl.detail"),
      saved: { kind: "agl" }
    },
    {
      id: "receiver",
      company: destination.company,
      kind: "receiver",
      receiver: destination.receiver,
      name: destination.network ? t(`networks.${destination.network}.name`) : destination.company,
      // Amazon names its warehouses only once it has the shipment; until then, when it does.
      places: destination.addresses.map((address) => ({ name: address.name, address })),
      detail: destination.network && t(`stops.${destination.network}`),
      saved: { kind: "receiver" }
    }
  ]
  const place = (stop: SavedStop) => places.find((candidate) => candidate.id === stopId(stop))!
  const poForwarder = via && stopId({ kind: "forwarder", ...via })
  const offered = places.filter(
    (candidate) => candidate.kind === "receiver" || (candidate.kind === "agl" && amazon) || candidate.id === poForwarder
  )
  const forwarderChoices = offered.filter((stop) => stop.kind === "forwarder")
  const choices: RouteChoices = [
    ...(forwarderChoices.length ? [{ label: t("forwarders"), stops: forwarderChoices }] : []),
    { label: destination.company, stops: offered.filter((stop) => stop.kind !== "forwarder") }
  ]
  return {
    route: {
      stops: route.stops.map(place),
      legs: route.legs.map((leg) => leg ?? undefined)
    } satisfies Route<RouteStop>,
    choices,
    saved: (edited: Route<RouteStop>): ShipmentRoute => ({
      stops: edited.stops.map((stop) => places.find((candidate) => candidate.id === stop.id)!.saved),
      legs: edited.stops.slice(1).map((_, index) => edited.legs[index] ?? null)
    })
  }
}
