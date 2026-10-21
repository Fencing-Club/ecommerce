import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { documents, events, jobs, orders, shipments, suppliers } from "@/db/schema"
import { eventMessage } from "@/lib/timeline-events"
import { withJobWake } from "./job-delivery"
import { lineLabels } from "./product-barcodes"
import { releaseIssues } from "./readiness"

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
        .where(and(eq(documents.orderId, shipment.orderId), eq(documents.outdated, 0)))
      if (releaseIssues(shipment, docs, missingLabels).length) {
        return false
      }
      const [supplier] = await tx
        .select({ supplierOrgId: suppliers.supplierOrgId, email: suppliers.email })
        .from(orders)
        .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
        .where(eq(orders.id, shipment.orderId))
      await tx.update(shipments).set({ status: "ready", updatedAt: new Date() }).where(eq(shipments.id, shipment.id))
      // Only a supplier that joined Copacker is emailed that its labels are ready, since the email links to the shipment
      // in its workspace. For one that hasn't, the buyer downloads the packet and shares it, as it does the purchase
      // order's documents.
      if (supplier?.supplierOrgId && supplier.email) {
        await tx
          .insert(jobs)
          .values({
            key: `ready:${shipment.id}:${shipment.revision}`,
            kind: "email",
            payload: { type: "ready", to: supplier.email, orderId: shipment.orderId, shipmentId: shipment.id }
          })
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
