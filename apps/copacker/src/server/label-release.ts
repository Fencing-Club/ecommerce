import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { db, type Transaction } from "@/db"
import { documents, events, jobs, orders, shipments, suppliers } from "@/db/schema"
import { eventMessage } from "@/lib/timeline-events"
import { withJobWake } from "./job-delivery"
import { jobRow, type JobInput } from "./job-payloads"
import { PollAgain } from "./job-runtime"
import { describeError, logEvent } from "./log"
import { lineLabels } from "./product-barcodes"
import { releaseIssues } from "./readiness"

// A labels job sends a shipment's labels once they're complete, or those of every shipment of a buyer's that waits on
// them. It's queued in the transaction of the change that can complete them, so they still go when sending them right
// after that change fails: the queue tries the job again until they do.
type LabelsPayload = JobInput<"labels">
export type QueuedLabels = { key: string; payload: LabelsPayload }

export async function queueLabels(tx: Transaction, payload: LabelsPayload): Promise<QueuedLabels> {
  const key = `labels:${"shipmentId" in payload ? payload.shipmentId : payload.buyerOrgId}:${randomUUID()}`
  await tx.insert(jobs).values(jobRow("labels", key, payload))
  return { key, payload }
}

async function sendLabels(payload: LabelsPayload) {
  if ("shipmentId" in payload) {
    return sendLabelsWhenComplete(payload.shipmentId, payload.actor)
  }
  await sendCompleteLabels(payload.buyerOrgId, payload.actor)
  return false
}

// Sends a queued job's labels straight after the change that queued it, and takes the job back once that's done. A
// failure leaves the job for the queue, so the change still succeeds. Returns whether the labels went.
export async function sendQueuedLabels({ key, payload }: QueuedLabels) {
  let sent: boolean
  try {
    sent = await sendLabels(payload)
  } catch (error) {
    logEvent("error", "labels_send_failed", { key, error: describeError(error) })
    return withJobWake(Promise.resolve(false))
  }
  // A job the queue has started, or one a failed cleanup leaves, finds nothing left to send.
  await db()
    .delete(jobs)
    .where(and(eq(jobs.key, key), eq(jobs.status, "pending")))
    .catch((error: unknown) => logEvent("error", "labels_job_cleanup_failed", { key, error: describeError(error) }))
  return sent
}

export async function labelsJob(input: JobInput<"labels">) {
  try {
    await sendLabels(input)
  } catch (error) {
    throw new PollAgain(error instanceof Error ? error.message : "Labels weren't sent", { delayMs: 5 * 60_000 })
  }
}

// A shipment's labels go to its supplier as soon as its packet is complete, with no step of the buyer's: when Amazon's
// carton labels arrive for a shipment that needs nothing else, or when the buyer adds the carrier labels, transport or
// product barcode it was still waiting for. `actor` is whoever completed it, "amazon" for Amazon's labels. Returns
// whether the labels went.
export async function sendLabelsWhenComplete(shipmentId: string, actor: string) {
  const [row] = await db()
    .select({ shipment: shipments, order: orders })
    .from(shipments)
    .innerJoin(orders, eq(orders.id, shipments.orderId))
    .where(eq(shipments.id, shipmentId))
  if (row?.shipment.status !== "waiting_labels") {
    return false
  }
  // Lines whose product can't make a label yet hold the packet back, read from the shipment's revision as the packet is.
  const missingLabels = new Set(
    (await lineLabels({ ...row.order, data: row.shipment.snapshot ?? row.order.data })).flatMap((label) =>
      label.state === "missing" ? [label.itemId] : []
    )
  )
  return withJobWake(
    db().transaction(async (tx) => {
      const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
      if (shipment?.status !== "waiting_labels") {
        return false
      }
      const docs = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.orderId, shipment.orderId), eq(documents.outdated, false)))
      if (releaseIssues(shipment, docs, missingLabels).length) {
        return false
      }
      const [supplier] = await tx
        .select({ supplierOrgId: suppliers.supplierOrgId, email: suppliers.email })
        .from(orders)
        .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
        .where(eq(orders.id, shipment.orderId))
      await tx.update(shipments).set({ status: "ready" }).where(eq(shipments.id, shipment.id))
      // Only a supplier that joined Copacker is emailed that its labels are ready, since the email links to the shipment
      // in its workspace. For one that hasn't, the buyer downloads the packet and shares it, as it does the purchase
      // order's documents.
      if (supplier?.supplierOrgId && supplier.email) {
        await tx
          .insert(jobs)
          .values(
            jobRow("email", `ready:${shipment.id}:${shipment.revision}`, {
              type: "ready",
              to: supplier.email,
              orderId: shipment.orderId,
              shipmentId: shipment.id
            })
          )
          .onConflictDoNothing()
      }
      await tx.insert(events).values({
        orderId: shipment.orderId,
        actor,
        ...eventMessage({ key: supplier?.supplierOrgId ? "labelsReleased" : "labelsReleasedToShare", values: null })
      })
      return true
    })
  )
}

// Every shipment of the buyer's that waits on its labels, sent once complete: after a change that can complete many
// at once, such as a product's barcode.
export async function sendCompleteLabels(buyerOrgId: string, actor: string) {
  const waiting = await db()
    .select({ id: shipments.id })
    .from(shipments)
    .innerJoin(orders, eq(orders.id, shipments.orderId))
    .where(and(eq(orders.buyerOrgId, buyerOrgId), eq(shipments.status, "waiting_labels")))
  for (const shipment of waiting) {
    await sendLabelsWhenComplete(shipment.id, actor)
  }
}
