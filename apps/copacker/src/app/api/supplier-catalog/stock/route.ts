import { and, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { supplierProducts } from "@/db/schema"
import { session } from "@/server/auth"
import { appUrl } from "@/server/security"

const stockInput = z.strictObject({
  counts: z
    .array(z.strictObject({ id: z.uuid(), onHand: z.number().int().min(-2147483648).max(2147483647) }))
    .min(1)
    .max(5000)
})

// Saves the on hand counts changed on the Inventory page, all or none. A count replaces what was there, so it needs no
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
    const { counts } = stockInput.parse(await request.json())
    const ids = counts.map((count) => count.id)
    if (new Set(ids).size !== ids.length) {
      throw new Error("A variant is counted twice")
    }
    const saved = await db().transaction(async (tx) => {
      const tracked = await tx
        .select({ id: supplierProducts.id })
        .from(supplierProducts)
        .where(
          and(
            eq(supplierProducts.supplierOrgId, s.org.id),
            eq(supplierProducts.trackInventory, true),
            inArray(supplierProducts.id, ids)
          )
        )
        .for("update")
      if (tracked.length !== ids.length) {
        return null
      }
      for (const count of counts) {
        await tx
          .update(supplierProducts)
          .set({ onHand: count.onHand, revision: sql`${supplierProducts.revision} + 1`, updatedAt: new Date() })
          .where(eq(supplierProducts.id, count.id))
      }
      return counts.length
    })
    if (saved === null) {
      return Response.json({ error: "A variant no longer tracks inventory. Refresh and try again" }, { status: 404 })
    }
    return Response.json({ saved })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save stock" }, { status: 400 })
  }
}
