import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { supplierProducts } from "@/db/schema"
import { session } from "@/server/auth"
import { requireAccess, requireSupplier } from "@/server/authorization"
import { errorResponse, requestInput, requestJson } from "@/server/errors"

const trackingInput = z.strictObject({
  id: z.uuid(),
  trackInventory: z.boolean().optional(),
  continueSelling: z.boolean().optional()
})

// Turns stock counting on or off for a product, or lets POs order it past what's on hand, from the Inventory page.
export async function POST(request: Request) {
  const s = await session()
  requireSupplier(s)
  requireAccess(s, "inventory", "edit")
  const { id, ...changes } = requestInput(trackingInput, await requestJson(request))
  const [updated] = await db()
    .update(supplierProducts)
    .set({ ...changes, revision: sql`${supplierProducts.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(supplierProducts.id, id), eq(supplierProducts.supplierOrgId, s.org.id)))
    .returning({ revision: supplierProducts.revision })
  if (!updated) {
    return errorResponse("productRemoved", 404)
  }
  return Response.json({ revision: updated.revision })
}
