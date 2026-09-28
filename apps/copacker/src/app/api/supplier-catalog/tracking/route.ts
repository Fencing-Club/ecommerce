import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { supplierProducts } from "@/db/schema"
import { requireAccess, session } from "@/server/auth"
import { failureStatus } from "@/server/errors"
import { appUrl } from "@/server/security"

const trackingInput = z.strictObject({
  id: z.uuid(),
  trackInventory: z.boolean().optional(),
  continueSelling: z.boolean().optional()
})

// Turns stock counting on or off for a product, or lets POs order it past what's on hand, from the Inventory page.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const s = await session()
    if (s.org.kind !== "supplier") {
      return Response.json({ error: "A supplier workspace is required" }, { status: 403 })
    }
    requireAccess(s, "inventory", "edit")
    const { id, ...changes } = trackingInput.parse(await request.json())
    const [updated] = await db()
      .update(supplierProducts)
      .set({ ...changes, revision: sql`${supplierProducts.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(supplierProducts.id, id), eq(supplierProducts.supplierOrgId, s.org.id)))
      .returning({ revision: supplierProducts.revision })
    if (!updated) {
      return Response.json({ error: "This product was removed" }, { status: 404 })
    }
    return Response.json({ revision: updated.revision })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save" },
      { status: failureStatus(error) }
    )
  }
}
