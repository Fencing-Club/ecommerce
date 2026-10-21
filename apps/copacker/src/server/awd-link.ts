import { orderDestination } from "@repo/copacker-shipments"
import { and, eq, ne, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, events, orders, orderProposals, shipments } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { eventMessage } from "@/lib/timeline-events"
import { accessibleOrder } from "./access"
import { requireBuyer } from "./authorization"
import { amazonFor } from "./connections"
import type { Session } from "./workspace-session"

export async function linkExistingAwd(s: Session, id: string, revision: number, raw: unknown) {
  requireBuyer(s)
  const shipmentId = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^STAR-[A-Z0-9]+$/)
    .nullable()
    .parse(raw)
  const [initial] = await db().select().from(shipments).where(eq(shipments.id, id))
  if (!initial) {
    throw new LocalizedError("shipmentNotFound")
  }
  const { order } = await accessibleOrder(s, initial.orderId)
  if (orderDestination(order.data) !== "amazon" || initial.amazonNetwork !== "awd_us") {
    throw new LocalizedError("linkAwdOnly")
  }
  if (shipmentId) {
    const remote = await (await amazonFor(s.org.id, order.amazonSellerId)).awdInboundShipment(shipmentId)
    if (remote.shipmentId !== shipmentId || remote.shipmentStatus !== "CREATED") {
      throw new LocalizedError("awdShipmentAlreadyShipped")
    }
    const quantities = new Map<string, number>()
    for (const carton of remote.shipmentContainerQuantities) {
      for (const product of carton.distributionPackage.contents.products) {
        quantities.set(product.sku, (quantities.get(product.sku) ?? 0) + product.quantity * carton.count)
      }
    }
    if (
      !quantities.size ||
      [...quantities].some(([sku, units]) => {
        const item = order.data.items.find((line) => line.buyerSku === sku && line.receiver === "awd_us")
        return !item || units * item.piecesPerSet > item.pieces
      })
    ) {
      throw new LocalizedError("awdProductsDiffer")
    }
  }
  return db().transaction(async (tx) => {
    const { order: currentOrder } = await accessibleOrder(s, order.id, tx, true)
    const [proposal] = await tx
      .select({ id: orderProposals.id })
      .from(orderProposals)
      .where(and(eq(orderProposals.orderId, order.id), eq(orderProposals.status, "pending")))
    if (proposal) {
      throw new LocalizedError("changesAwaitingApproval")
    }
    // Serialize links for this seller workspace before checking other POs for the same shipment.
    const [account] = await tx
      .select()
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "amazon")))
      .for("update")
    if (shipmentId && (!account || account.externalId !== order.amazonSellerId)) {
      throw new LocalizedError("amazonAccountChanged")
    }
    const [current] = await tx.select().from(shipments).where(eq(shipments.id, id)).for("update")
    if (
      !current ||
      current.revision !== revision ||
      currentOrder.revision !== order.revision ||
      current.amazonNetwork !== "awd_us" ||
      !["packing", "correction"].includes(current.status) ||
      current.operation !== "none" ||
      current.amazonOrderId
    ) {
      throw new LocalizedError("shipmentChangedSubmit")
    }
    if (shipmentId) {
      const [duplicate] = await tx
        .select({ id: shipments.id })
        .from(shipments)
        .innerJoin(orders, eq(orders.id, shipments.orderId))
        .where(
          and(
            eq(orders.buyerOrgId, s.org.id),
            ne(shipments.id, id),
            or(eq(shipments.linkedAmazonShipmentId, shipmentId), eq(shipments.amazonShipmentId, shipmentId)),
            ne(shipments.status, "cancelled")
          )
        )
      if (duplicate) {
        throw new LocalizedError("awdAlreadyLinked")
      }
    }
    await tx
      .update(shipments)
      .set({ linkedAmazonShipmentId: shipmentId, revision: revision + 1, updatedAt: new Date() })
      .where(eq(shipments.id, id))
    await tx.insert(events).values({
      orderId: order.id,
      actor: s.user.id,
      ...eventMessage(
        shipmentId ? { key: "existingAwdLinked", values: { shipmentId } } : { key: "existingAwdUnlinked", values: null }
      )
    })
    return { revision: revision + 1 }
  })
}
