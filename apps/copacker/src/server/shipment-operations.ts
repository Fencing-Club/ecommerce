import { randomUUID } from "node:crypto"
import { routeIssues } from "@repo/copacker-packing-rules"
import {
  amazonReference,
  awdShipmentIdPattern,
  fbaInboundPlanIdPattern,
  fbaPlanName
} from "@repo/copacker-shipments/amazon-inbound"
import { canEditRoute, ruleRoute, type ShipmentRoute, shipmentRouteSchema } from "@repo/copacker-shipments/route"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { jobs, shipments } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { accessibleShipment } from "./access"
import { amazonFor } from "./connections"
import { requestInput } from "./errors"
import { cancelAmazonShipment } from "./fba-shipments"
import { forwarderAddress } from "./forwarders"
import { withJobWake } from "./job-delivery"
import { jobRow } from "./job-payloads"
import { queueLabels, sendQueuedLabels } from "./label-release"
import { recordEvent } from "./order-history"
import { withRoute, writeStops } from "./shipment-routes"
import type { Session } from "./workspace-session"

// What a buyer does to a shipment Amazon is creating, once it needs a hand: try again, match it to the Amazon order it
// already made, cancel that order, and choose the shipment's route.

// Queues the shipment's Amazon job for its revision again, as a fresh attempt that an expired worker can't take back.
async function requeueAmazon(tx: Transaction, shipment: { id: string; revision: number }) {
  await tx
    .insert(jobs)
    .values(
      jobRow("amazon", `amazon:${shipment.id}:${shipment.revision}`, {
        shipmentId: shipment.id,
        revision: shipment.revision
      })
    )
    .onConflictDoUpdate({
      target: jobs.key,
      set: { id: randomUUID(), status: "pending", attempts: 0, error: null, runAt: new Date() }
    })
}

// Tries a shipment that needs attention again, when what Amazon made of the last try is known.
export async function retryShipment(s: Session, id: string, revision: number) {
  await withJobWake(
    db().transaction(async (tx) => {
      const { shipment } = await accessibleShipment(s, id, { executor: tx, lock: true })
      if (shipment.status !== "needs_attention" || shipment.operation === "sending" || shipment.revision !== revision) {
        throw new LocalizedError("reconcileBeforeRetry")
      }
      await tx.update(shipments).set({ status: "queued", issue: null }).where(eq(shipments.id, shipment.id))
      await requeueAmazon(tx, shipment)
    })
  )
}

// Matches a shipment whose Amazon request has an unknown outcome, or one in correction, to the AWD order or FBA inbound
// plan Amazon made for it, once Amazon confirms it names this shipment, so the worker carries on from there.
export async function reconcileShipment(s: Session, id: string, rawAmazonOrderId: string) {
  const { order, shipment } = await accessibleShipment(s, id)
  if (!shipment.snapshot || !shipment.packing || !["needs_attention", "correction"].includes(shipment.status)) {
    throw new LocalizedError("shipmentNotAwaitingReconciliation")
  }
  const fba = shipment.amazonNetwork === "fba"
  const amazonOrderId = requestInput(
    z
      .string()
      .trim()
      .regex(fba ? fbaInboundPlanIdPattern : awdShipmentIdPattern),
    rawAmazonOrderId
  )
  if (shipment.amazonOrderId && shipment.amazonOrderId !== amazonOrderId) {
    throw new LocalizedError("shipmentLinkedToOtherAmazonOrder")
  }
  const api = await amazonFor(s.org.id, order.amazonSellerId)
  const reference = (fba ? fbaPlanName : amazonReference)(shipment.id, shipment.revision)
  const found = fba ? (await api.fbaPlan(amazonOrderId)).name : (await api.order(amazonOrderId)).externalReferenceId
  if (found !== reference) {
    throw new LocalizedError("amazonOrderNotForShipment")
  }
  await withJobWake(
    db().transaction(async (tx) => {
      const [current] = await tx.select().from(shipments).where(eq(shipments.id, shipment.id)).for("update")
      if (current?.revision !== shipment.revision || current?.status !== shipment.status) {
        throw new LocalizedError("shipmentChangedWhileReconciling")
      }
      await tx
        .update(shipments)
        .set({ amazonOrderId, operation: "created", status: "queued", issue: null })
        .where(eq(shipments.id, shipment.id))
      await requeueAmazon(tx, shipment)
    })
  )
}

// Cancels the AWD order or FBA inbound plan of a shipment in correction, once Amazon confirms it, which frees its
// quantities for a new shipment. Amazon cancels an AWD order at once and an FBA inbound plan in the background, so a
// plan may need a moment.
export async function cancelAtAmazon(s: Session, id: string) {
  const { order, shipment } = await accessibleShipment(s, id)
  if (!shipment.amazonOrderId || shipment.linkedAmazonShipmentId || shipment.status !== "correction") {
    throw new LocalizedError("amazonShipmentNotInCorrection")
  }
  if (!(await cancelAmazonShipment(await amazonFor(s.org.id, order.amazonSellerId), shipment))) {
    throw new LocalizedError("amazonStillCancelling")
  }
  await db().transaction(async (tx) => {
    // Only the shipment as it was cancels: one that changed meanwhile keeps its state, and its timeline says nothing.
    const cancelled = await tx
      .update(shipments)
      .set({ status: "cancelled", issue: null })
      .where(
        and(
          eq(shipments.id, shipment.id),
          eq(shipments.revision, shipment.revision),
          eq(shipments.status, "correction")
        )
      )
      .returning({ id: shipments.id })
    if (cancelled.length) {
      await recordEvent(tx, shipment.orderId, s.user.id, { key: "amazonShipmentCancelled", values: null })
    }
  })
}

export const routeInputSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  route: shipmentRouteSchema,
  // The route the page showed, which must still be the shipment's.
  expected: shipmentRouteSchema
})

// The same route, whichever order its fields came in.
const sameRoute = (a: ShipmentRoute, b: ShipmentRoute) =>
  JSON.stringify(shipmentRouteSchema.parse(a)) === JSON.stringify(shipmentRouteSchema.parse(b))

// Saves a shipment's route. It stops at the purchase order's forwarder, if any, and breaks none of the route rules. A
// shipment that waited only on who moves its last leg goes to its supplier.
export async function saveRoute(s: Session, { id, revision, route, expected }: z.output<typeof routeInputSchema>) {
  const queued = await db().transaction(async (tx) => {
    const { order, shipment } = await accessibleShipment(s, id, { executor: tx, lock: true })
    const current = await withRoute(tx, shipment, order.data)
    if (
      !canEditRoute(shipment.status, shipment.operation, current.transport) ||
      shipment.revision !== revision ||
      !sameRoute(current.route, expected)
    ) {
      throw new LocalizedError("routeChanged")
    }
    const via = (shipment.snapshot ?? order.data).via
    const forwarders = route.stops.flatMap((stop) => (stop.kind === "forwarder" ? [stop] : []))
    const known =
      !forwarders.length ||
      (via &&
        forwarders.every((stop) => stop.forwarderId === via.forwarderId && stop.addressId === via.addressId) &&
        (await forwarderAddress(order.buyerOrgId, via.forwarderId, via.addressId, tx)))
    if (!known || routeIssues(ruleRoute(route, current.receiver)).length) {
      throw new LocalizedError("routeNotAllowed")
    }
    await writeStops(tx, id, route)
    // A route that needs no carrier labels can complete a shipment that waited on it.
    return shipment.status === "waiting_labels" ? queueLabels(tx, { shipmentId: id, actor: s.user.id }) : null
  })
  if (queued) {
    await sendQueuedLabels(queued)
  }
}
