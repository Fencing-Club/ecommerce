import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { supplierProducts } from "@/db/schema"
import { session } from "@/server/auth"
import { requireAccess, requireSupplier } from "@/server/authorization"
import { errorResponse, failureMessage, failureStatus } from "@/server/errors"

const trackingInput = z.strictObject({
  id: z.uuid(),
  trackInventory: z.boolean().optional(),
  continueSelling: z.boolean().optional()
})

// Turns stock counting on or off for a product, or lets POs order it past what's on hand, from the Inventory page.
export async function POST(request: Request) {
  try {
    const s = await session()
    requireSupplier(s)
    requireAccess(s, "inventory", "edit")
    const { id, ...changes } = trackingInput.parse(await request.json())
    const [updated] = await db()
      .update(supplierProducts)
      .set({ ...changes, revision: sql`${supplierProducts.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(supplierProducts.id, id), eq(supplierProducts.supplierOrgId, s.org.id)))
      .returning({ revision: supplierProducts.revision })
    if (!updated) {
      return errorResponse("productRemoved", 404)
    }
    return Response.json({ revision: updated.revision })
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "saveFailedShort") }, { status: failureStatus(error) })
  }
}
