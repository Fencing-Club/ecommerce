import type { OrderInput } from "@repo/copacker-orders"
import {
  type AmazonNetwork,
  isAmazonNetwork,
  legArrangements,
  orderDestination,
  type ReceiverId,
  type Route,
  type RouteStop
} from "@repo/copacker-packing-rules"
import { z } from "zod"
import { releasedStates, type ShipmentState } from "./states"
import type { ShipmentTransport } from "./transport"

// A shipment's route: its stops in order and who moves the goods between each two (`@repo/copacker-packing-rules/routes`).
// A stop names its place by id, or by the shipment: the supplier's pickup address is the packing's, a forwarder's
// warehouse is one of the buyer's forwarder addresses, and the receiver is where the shipment's goods end up
// (shipmentReceiver). A leg nobody has to choose, to and from AGL, is null, and so is one nobody has chosen yet.
export const stopKinds = ["supplier", "forwarder", "agl", "receiver"] as const
export const savedStopSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("supplier") }),
  z.object({ kind: z.literal("forwarder"), forwarderId: z.uuid(), addressId: z.uuid() }),
  z.object({ kind: z.literal("agl") }),
  z.object({ kind: z.literal("receiver") })
])
export type SavedStop = z.infer<typeof savedStopSchema>
export const shipmentRouteSchema = z
  .object({
    stops: z.array(savedStopSchema).min(2).max(8),
    legs: z.array(z.enum(legArrangements).nullable())
  })
  .refine((route) => route.legs.length === route.stops.length - 1, "A route has one leg fewer than it has stops")
export type ShipmentRoute = z.infer<typeof shipmentRouteSchema>

// A saved stop's id, which tells two places apart: "supplier", "agl", "receiver" or "forwarder:<forwarder>:<address>".
export function stopId(stop: SavedStop) {
  return stop.kind === "forwarder" ? `forwarder:${stop.forwarderId}:${stop.addressId}` : stop.kind
}

// The route as the route rules read it, ending at the shipment's receiver.
export function ruleRoute(route: ShipmentRoute, receiver: ReceiverId): Route {
  return {
    stops: route.stops.map((stop): RouteStop => ({
      id: stopId(stop),
      company: "",
      kind: stop.kind,
      receiver: stop.kind === "receiver" ? receiver : undefined
    })),
    legs: route.legs.map((leg) => leg ?? undefined)
  }
}

// Where a shipment's goods end up, as the route rules read it: the buyer's warehouse, or the Amazon network the shipment
// goes to. Until an Amazon shipment is on its way it goes where its lines do, and one whose lines go to both networks
// splits into one shipment each; the rules are the same for both.
export function shipmentReceiver(
  order: { items: readonly { receiver: ReceiverId }[] },
  network: AmazonNetwork | null
): ReceiverId {
  if (orderDestination(order) === "warehouse") {
    return "warehouse"
  }
  return network ?? order.items.find((item) => isAmazonNetwork(item.receiver))!.receiver
}

// The route of a shipment that hasn't saved one: from the supplier by way of the purchase order's forwarder, which the
// supplier ships to, to where its goods end up. Nobody has chosen who moves the last leg yet.
export function defaultShipmentRoute(order: { via?: OrderInput["via"] }): ShipmentRoute {
  return order.via
    ? {
        stops: [{ kind: "supplier" }, { kind: "forwarder", ...order.via }, { kind: "receiver" }],
        legs: ["senderArranges", null]
      }
    : { stops: [{ kind: "supplier" }, { kind: "receiver" }], legs: [null] }
}

// The route a shipment follows until it saves its own: its PO's, by way of the PO's forwarder only while that forwarder
// address is still kept (`kept`). The server and the shipment page both read it here, so the route a page shows is the
// one its save is checked against.
export function followedRoute(
  order: { via?: OrderInput["via"] },
  kept: readonly { forwarderId: string; addressId: string }[]
): ShipmentRoute {
  const { via } = order
  const known = kept.some((stop) => stop.forwarderId === via?.forwarderId && stop.addressId === via.addressId)
  return defaultShipmentRoute({ via: known ? via : undefined })
}

// How the goods travel on the last leg, as documents, readiness and carrier labels read it, all from the route. AGL
// collects them where they wait for it. Otherwise the stop the last leg leaves from hands them over: collected unless
// it delivers them itself. The buyer adds a carrier label to each carton when it books the carrier: into Amazon, where
// the shipment is on the buyer's account, or to its own warehouse when it arranges the shipping. Null until someone is
// chosen for the last leg.
export function routeTransport(route: ShipmentRoute, receiver: ReceiverId): ShipmentTransport | null {
  const handoff = (stop: SavedStop | undefined) => (stop?.kind === "forwarder" ? "forwarder" : "supplier")
  const agl = route.stops.findIndex((stop) => stop.kind === "agl")
  if (agl > 0) {
    return { service: "agl", handoff: handoff(route.stops[agl - 1]), collection: "pickup", carrierLabels: "none" }
  }
  const last = route.stops.length - 1
  const leg = route.legs[last - 1]
  if (!leg || route.stops[last]?.kind !== "receiver") {
    return null
  }
  const buyerBooks = receiver === "warehouse" ? leg === "receiverArranges" : leg === "senderArranges"
  return {
    service: buyerBooks ? "parcel" : "freight",
    handoff: handoff(route.stops[last - 1]),
    collection: leg === "senderMoves" ? "dropoff" : "pickup",
    carrierLabels: buyerBooks ? "per_carton" : "none"
  }
}

const routeStates: readonly ShipmentState[] = ["packing", "packed", "correction", "waiting_labels"]

// Whether the buyer can change a shipment's route: until Amazon has it, and while it waits for its labels. A shipment
// released before anyone chose who moves its last leg (`transport`) can choose it once, without reopening its packing.
export function canEditRoute(status: ShipmentState, operation: string, transport: ShipmentTransport | null) {
  return (
    (routeStates.includes(status) && (status === "waiting_labels" || operation === "none")) ||
    (!transport && releasedStates.includes(status))
  )
}
