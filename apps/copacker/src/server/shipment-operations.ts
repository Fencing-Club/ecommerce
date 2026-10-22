import { randomUUID } from "node:crypto"
import {
  amazonReference,
  awdShipmentIdPattern,
  fbaInboundPlanIdPattern,
  fbaPlanName
} from "@repo/copacker-shipments/amazon-inbound"
import { canConfigureTransport, transportSchema } from "@repo/copacker-shipments/transport"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { jobs, shipments } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { accessibleShipment } from "./access"
import { amazonFor } from "./connections"
import { requestInput } from "./errors"
import { cancelAmazonShipment } from "./fba-shipments"
import { withJobWake } from "./job-delivery"
import { jobRow } from "./job-payloads"
import { queueLabels, sendQueuedLabels } from "./label-release"
import { recordEvent } from "./order-history"
import type { Session } from "./workspace-session"

// What a buyer does to a shipment Amazon is creating, once it needs a hand: try again, match it to the Amazon order it
// already made, cancel that order, and say how the cartons travel.

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

export const transportInputSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  transport: transportSchema,
  // The transport the page showed, which must still be the saved one.
  expected: transportSchema.nullable()
})

// Saves how a shipment's cartons travel. A shipment that waited only on it goes to its supplier.
export async function saveTransport(
  s: Session,
  { id, revision, transport, expected }: z.output<typeof transportInputSchema>
) {
  const queued = await db().transaction(async (tx) => {
    const { order, shipment } = await accessibleShipment(s, id, { executor: tx, lock: true })
    if (
      !canConfigureTransport(shipment.status, shipment.operation, shipment.transport) ||
      shipment.revision !== revision ||
      JSON.stringify(shipment.transport && transportSchema.parse(shipment.transport)) !== JSON.stringify(expected)
    ) {
      throw new LocalizedError("transportChanged")
    }
    if (transport.handoff === "forwarder" && !(shipment.snapshot ?? order.data).via) {
      throw new LocalizedError("transportForwarderMissing")
    }
    await tx.update(shipments).set({ transport }).where(eq(shipments.id, id))
    // Transport that needs no carrier labels can complete a shipment that waited on it.
    return shipment.status === "waiting_labels" ? queueLabels(tx, { shipmentId: id, actor: s.user.id }) : null
  })
  if (queued) {
    await sendQueuedLabels(queued)
  }
}
