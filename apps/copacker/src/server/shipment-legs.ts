import type { OrderInput } from "@repo/aisle"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { documents, events, forwarders, landedCosts, orders, shipments, suppliers } from "@/db/schema"
import type { Session } from "./auth"

// The forwarder a PO's goods pass through, if any: the stop on the way to Amazon, or the forwarder a PO is sent to.
// Its leg comes after the supplier's: the forwarder ships the goods on once they've arrived.
export function forwarderLeg(order: Pick<OrderInput, "destination" | "forwarderId" | "via">) {
  return order.via?.forwarderId ?? (order.destination === "forwarder" ? order.forwarderId : undefined) ?? null
}

// A shipment and its PO, locked, for a leg holder to move on.
async function lockedShipment(tx: Transaction, shipmentId: string) {
  const [initial] = await tx.select({ orderId: shipments.orderId }).from(shipments).where(eq(shipments.id, shipmentId))
  if (!initial) {
    throw new Error("Shipment not found")
  }
  const [row] = await tx
    .select({ order: orders, supplier: suppliers })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(eq(orders.id, initial.orderId))
    .for("update", { of: orders })
  const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
  return { ...row!, shipment: shipment! }
}

// Marks a released shipment's goods shipped by the supplier: the supplier itself, or the buyer for a supplier that
// isn't on Copacker. The shipment's commercial invoice must still be current.
export async function shipShipment(s: Session, shipmentId: string) {
  await db().transaction(async (tx) => {
    const { order, supplier, shipment } = await lockedShipment(tx, shipmentId)
    const allowed =
      s.org.kind === "supplier"
        ? supplier.supplierOrgId === s.org.id && !supplier.removedAt
        : s.org.kind === "buyer" && order.buyerOrgId === s.org.id && !supplier.supplierOrgId
    if (!allowed) {
      throw new Error(
        s.org.kind === "buyer" ? "The supplier marks this shipment shipped" : "This shipment isn't yours to ship"
      )
    }
    if (shipment.status !== "ready") {
      throw new Error("Only a released shipment can be marked shipped")
    }
    const [invoice] = shipment.packing
      ? await tx
          .select({ id: documents.id })
          .from(documents)
          .where(
            and(
              eq(documents.id, shipment.packing.invoiceDocumentId),
              eq(documents.kind, "invoice"),
              eq(documents.outdated, 0)
            )
          )
      : []
    if (!invoice) {
      throw new Error("Upload the current commercial invoice before shipping")
    }
    await tx.update(shipments).set({ status: "shipped", updatedAt: new Date() }).where(eq(shipments.id, shipmentId))
    await tx.insert(events).values({ orderId: order.id, actor: s.user.id, message: "Supplier shipped the goods" })
  })
}

export const forwardInputSchema = z.strictObject({
  id: z.uuid(),
  // What the forwarder charges to ship the goods on, in the PO's currency.
  freight: z.strictObject({
    amountMinor: z.number().int().min(0).max(100000000),
    currency: z.string().trim().toUpperCase().length(3)
  }),
  carrier: z.string().trim().min(1).max(100),
  // The carrier's tracking or booking number.
  reference: z.string().trim().min(1).max(100)
})

// Marks shipped goods shipped on by the forwarder they passed through: the forwarder itself, or the buyer for a
// forwarder that isn't on Copacker. Its freight is recorded as the PO's landed cost, and its carrier and tracking on the
// shipment.
export async function forwardShipment(s: Session, raw: unknown) {
  const input = forwardInputSchema.parse(raw)
  await db().transaction(async (tx) => {
    const { order, shipment } = await lockedShipment(tx, input.id)
    const forwarderId = forwarderLeg(order.data)
    const [forwarder] = forwarderId
      ? await tx
          .select()
          .from(forwarders)
          .where(and(eq(forwarders.id, forwarderId), eq(forwarders.buyerOrgId, order.buyerOrgId)))
      : []
    if (!forwarder) {
      throw new Error("This shipment doesn't pass through a forwarder")
    }
    const allowed =
      s.org.kind === "forwarder"
        ? forwarder.forwarderOrgId === s.org.id && !forwarder.removedAt
        : s.org.kind === "buyer" && order.buyerOrgId === s.org.id && !forwarder.forwarderOrgId
    if (!allowed) {
      throw new Error(
        s.org.kind === "buyer" ? `${forwarder.name} marks this shipment shipped` : "This shipment isn't yours to ship"
      )
    }
    if (shipment.status !== "shipped") {
      throw new Error("The supplier hasn't shipped these goods yet")
    }
    if (input.freight.currency !== order.data.currency) {
      throw new Error(`Enter the freight in ${order.data.currency}, the PO's currency`)
    }
    await tx
      .update(shipments)
      .set({
        status: "forwarded",
        forwarderCarrier: input.carrier,
        forwarderReference: input.reference,
        updatedAt: new Date()
      })
      .where(eq(shipments.id, shipment.id))
    if (input.freight.amountMinor > 0) {
      await tx.insert(landedCosts).values({
        orderId: order.id,
        kind: "freight",
        description: `${forwarder.name} freight, ${input.carrier} ${input.reference}`,
        amountMinor: input.freight.amountMinor,
        createdBy: s.user.id
      })
    }
    await tx.insert(events).values({
      orderId: order.id,
      actor: s.user.id,
      message: `${forwarder.name} shipped the goods: ${input.carrier} ${input.reference}`
    })
  })
}
