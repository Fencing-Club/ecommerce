import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { supplierProducts } from "@/db/schema"
import { session } from "@/server/auth"
import { appUrl } from "@/server/security"

const stockInput = z.strictObject({
  id: z.uuid(),
  onHand: z.number().int().min(-2147483648).max(2147483647)
})

// Sets a tracked product's on hand count from the catalog's list. A count replaces what was there, so it needs no
// revision: the supplier counted what's on the shelf now.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const s = await session()
    if (s.org.kind !== "supplier") {
      return Response.json({ error: "A supplier workspace is required" }, { status: 403 })
    }
    const input = stockInput.parse(await request.json())
    const [updated] = await db()
      .update(supplierProducts)
      .set({ onHand: input.onHand, revision: sql`${supplierProducts.revision} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(supplierProducts.id, input.id),
          eq(supplierProducts.supplierOrgId, s.org.id),
          eq(supplierProducts.trackInventory, true)
        )
      )
      .returning({ revision: supplierProducts.revision })
    if (!updated) {
      return Response.json({ error: "This product doesn't track inventory" }, { status: 404 })
    }
    return Response.json({ revision: updated.revision })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save stock" }, { status: 400 })
  }
}
