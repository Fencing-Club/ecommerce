import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { orders, suppliers } from "@/db/schema"

// Removes a supplier from a buyer's workspace. Its invitation stops working and its workspace loses access to the
// buyer's POs. A supplier working on a sent PO stays until that PO is closed, so no shipment is left without its packer.
export async function removeSupplier(buyerOrgId: string, supplierId: string) {
  await db().transaction(async (tx) => {
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), eq(suppliers.buyerOrgId, buyerOrgId), isNull(suppliers.removedAt)))
      .for("update")
    if (!supplier) {
      throw new Error("This supplier was already removed")
    }
    const open = await tx
      .select({ data: orders.data })
      .from(orders)
      .where(and(eq(orders.supplierId, supplierId), eq(orders.status, "submitted")))
    if (open.length) {
      const references = open.map((order) => order.data.reference).join(", ")
      throw new Error(`${supplier.name} is working on ${references}. Close ${open.length === 1 ? "it" : "them"} first`)
    }
    await tx
      .update(suppliers)
      .set({ removedAt: new Date(), invitationHash: null, expiresAt: null })
      .where(eq(suppliers.id, supplierId))
  })
}

export const leadTimesSchema = z.strictObject({
  id: z.uuid(),
  leadTimeDays: z.number().int().min(1).max(730).nullable(),
  amazonLeadTimeDays: z.number().int().min(1).max(730).nullable()
})

// How long a supplier takes to deliver to the buyer's locations and to Amazon, used by restock.
export async function saveSupplierLeadTimes(buyerOrgId: string, raw: unknown) {
  const input = leadTimesSchema.parse(raw)
  const updated = await db()
    .update(suppliers)
    .set({ leadTimeDays: input.leadTimeDays, amazonLeadTimeDays: input.amazonLeadTimeDays })
    .where(and(eq(suppliers.id, input.id), eq(suppliers.buyerOrgId, buyerOrgId), isNull(suppliers.removedAt)))
    .returning({ id: suppliers.id })
  if (!updated.length) {
    throw new Error("This supplier was removed")
  }
}
