import { routeForwarder } from "@repo/copacker-shipments/route"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { forwarders, landedCosts, orders, shipments, suppliers } from "@/db/schema"
import { LocalizedError, NotFoundError } from "@/i18n/errors"
import { recordEvent } from "./order-history"
import { withRoute } from "./shipment-routes"
import type { Session } from "./workspace-session"

// A shipment and its PO, locked, for a leg holder to move on. Each leg checks who holds it, which accessibleShipment
// can't: a forwarder never opens the PO itself.
async function lockedShipment(tx: Transaction, shipmentId: string) {
  const [initial] = await tx.select({ orderId: shipments.orderId }).from(shipments).where(eq(shipments.id, shipmentId))
  if (!initial) {
    throw new NotFoundError()
  }
  const [row] = await tx
    .select({ order: orders, supplier: suppliers })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(eq(orders.id, initial.orderId))
    .for("update", { of: orders })
  const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
  if (!row || !shipment) {
    throw new NotFoundError()
  }
  return { ...row, shipment }
}

// Marks a released shipment's goods shipped by the supplier: the supplier itself, or the buyer for a supplier that
// isn't on Copacker.
export async function shipShipment(s: Session, shipmentId: string) {
  await db().transaction(async (tx) => {
    const { order, supplier, shipment } = await lockedShipment(tx, shipmentId)
    const allowed =
      s.org.kind === "supplier"
        ? supplier.supplierOrgId === s.org.id && !supplier.removedAt
        : s.org.kind === "buyer" && order.buyerOrgId === s.org.id && !supplier.supplierOrgId
    if (!allowed) {
      throw new LocalizedError(s.org.kind === "buyer" ? "supplierMarksShipped" : "notYourShipment")
    }
    if (shipment.status !== "ready") {
      throw new LocalizedError("onlyReleasedShipped")
    }
    await tx.update(shipments).set({ status: "shipped" }).where(eq(shipments.id, shipmentId))
    await recordEvent(tx, order.id, s.user.id, { key: "supplierShipped", values: null })
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
export async function forwardShipment(s: Session, input: z.output<typeof forwardInputSchema>) {
  await db().transaction(async (tx) => {
    const { order, shipment } = await lockedShipment(tx, input.id)
    // The forwarder the shipment's route stops at, whose leg follows the supplier's.
    const forwarderId = routeForwarder((await withRoute(tx, shipment, order.data)).route)?.forwarderId
    const [forwarder] = forwarderId
      ? await tx
          .select()
          .from(forwarders)
          .where(and(eq(forwarders.id, forwarderId), eq(forwarders.buyerOrgId, order.buyerOrgId)))
      : []
    if (!forwarder) {
      throw new LocalizedError("noForwarderLeg")
    }
    const allowed =
      s.org.kind === "forwarder"
        ? forwarder.forwarderOrgId === s.org.id && !forwarder.removedAt
        : s.org.kind === "buyer" && order.buyerOrgId === s.org.id && !forwarder.forwarderOrgId
    if (!allowed) {
      throw s.org.kind === "buyer"
        ? new LocalizedError("forwarderMarksShipped", { name: forwarder.name })
        : new LocalizedError("notYourShipment")
    }
    if (shipment.status !== "shipped") {
      throw new LocalizedError("supplierNotShipped")
    }
    if (input.freight.currency !== order.data.currency) {
      throw new LocalizedError("freightCurrency", { currency: order.data.currency })
    }
    await tx
      .update(shipments)
      .set({
        status: "forwarded",
        forwarderCarrier: input.carrier,
        forwarderReference: input.reference
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
    await recordEvent(tx, order.id, s.user.id, {
      key: "forwarderShipped",
      values: { forwarder: forwarder.name, tracking: `${input.carrier} ${input.reference}` }
    })
  })
}
