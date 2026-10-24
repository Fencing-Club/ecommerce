import type { OrderInput } from "@repo/copacker-orders"
import {
  defaultShipmentRoute,
  routeTransport,
  type SavedStop,
  type ShipmentRoute,
  shipmentReceiver
} from "@repo/copacker-shipments/route"
import { asc, eq, inArray } from "drizzle-orm"
import invariant from "tiny-invariant"
import type { Executor, Transaction } from "@/db"
import { shipmentStops, type shipments } from "@/db/schema"

type Shipment = typeof shipments.$inferSelect
type StopRow = typeof shipmentStops.$inferSelect

// A shipment's route is kept as its stops (shipment_stops), one row each in order. These read them back as routes and
// save them.

function savedStop(row: StopRow): SavedStop {
  if (row.kind !== "forwarder") {
    return { kind: row.kind }
  }
  invariant(row.forwarderId && row.addressId, "A forwarder stop names the forwarder's address")
  return { kind: "forwarder", forwarderId: row.forwarderId, addressId: row.addressId }
}

// Each shipment's saved route, by shipment. One that hasn't saved its route has none.
export async function savedRoutes(executor: Executor, ids: readonly string[]) {
  const rows = ids.length
    ? await executor
        .select()
        .from(shipmentStops)
        .where(inArray(shipmentStops.shipmentId, [...ids]))
        .orderBy(asc(shipmentStops.position))
    : []
  const stops = Map.groupBy(rows, (row) => row.shipmentId)
  // Each stop but the last moves the goods on to the next.
  return new Map(
    [...stops].map(([id, route]): [string, ShipmentRoute] => [
      id,
      { stops: route.map(savedStop), legs: route.slice(0, -1).map((row) => row.leg) }
    ])
  )
}

// A shipment's route: the one it saved, or until it saves one, its purchase order's. With where its goods end up, and how
// they travel on the last leg, which documents, readiness and carrier labels read.
export function shipmentRoute(
  shipment: Pick<Shipment, "snapshot" | "amazonNetwork">,
  order: OrderInput,
  saved: ShipmentRoute | undefined
) {
  const data = shipment.snapshot ?? order
  const receiver = shipmentReceiver(data, shipment.amazonNetwork)
  const route = saved ?? defaultShipmentRoute(data)
  return { route, saved: saved !== undefined, receiver, transport: routeTransport(route, receiver) }
}

// The shipments of one purchase order with their routes, read together.
export async function withRoutes<T extends Shipment>(executor: Executor, rows: readonly T[], order: OrderInput) {
  const saved = await savedRoutes(
    executor,
    rows.map((row) => row.id)
  )
  return rows.map((row) => ({ ...row, ...shipmentRoute(row, order, saved.get(row.id)) }))
}

// One shipment with its route.
export async function withRoute<T extends Shipment>(executor: Executor, row: T, order: OrderInput) {
  return (await withRoutes(executor, [row], order))[0]!
}

// Saves a shipment's route as its stops, in place of any it had, in the transaction that locked the shipment. Nobody
// chooses who moves the goods to and from AGL, so those legs stay empty.
export async function writeStops(tx: Transaction, shipmentId: string, route: ShipmentRoute) {
  await tx.delete(shipmentStops).where(eq(shipmentStops.shipmentId, shipmentId))
  await tx.insert(shipmentStops).values(
    route.stops.map((stop, position) => {
      const next = route.stops[position + 1]
      return {
        shipmentId,
        position,
        kind: stop.kind,
        forwarderId: stop.kind === "forwarder" ? stop.forwarderId : null,
        addressId: stop.kind === "forwarder" ? stop.addressId : null,
        leg: stop.kind === "agl" || next?.kind === "agl" ? null : (route.legs[position] ?? null)
      }
    })
  )
}
