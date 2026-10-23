import { and, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { supplierProducts } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { requireAccess, requireSupplier } from "./authorization"
import { requestInput, StatusError } from "./errors"
import type { Session } from "./workspace-session"

export const supplierCountsInput = z.strictObject({
  counts: z
    .array(
      z.strictObject({
        id: z.uuid(),
        onHand: z.number().int().min(-2147483648).max(2147483647),
        expectedRevision: z.number().int().positive()
      })
    )
    .min(1)
    .max(5000)
})
export async function saveSupplierCounts(s: Session, raw: unknown, preview = false) {
  requireSupplier(s)
  requireAccess(s, "inventory", "edit")
  const { counts } = requestInput(supplierCountsInput, raw)
  const ids = counts.map((row) => row.id)
  if (new Set(ids).size !== ids.length) {
    throw new LocalizedError("variantCountedTwice")
  }
  return db().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(supplierProducts)
      .where(
        and(
          eq(supplierProducts.supplierOrgId, s.org.id),
          eq(supplierProducts.trackInventory, true),
          inArray(supplierProducts.id, ids)
        )
      )
      .orderBy(supplierProducts.id)
      .for("update")
    if (rows.length !== ids.length) {
      throw new StatusError("variantNotTracked", 404)
    }
    const results = []
    for (const count of counts) {
      const before = rows.find((row) => row.id === count.id)!
      if (before.revision !== count.expectedRevision) {
        throw new StatusError("checkValues", 409)
      }
      if (!preview) {
        await tx
          .update(supplierProducts)
          .set({ onHand: count.onHand, revision: sql`${supplierProducts.revision} + 1` })
          .where(eq(supplierProducts.id, count.id))
      }
      results.push({
        variantId: count.id,
        before: before.onHand,
        quantity: count.onHand,
        revision: before.revision + 1
      })
    }
    return results
  })
}
