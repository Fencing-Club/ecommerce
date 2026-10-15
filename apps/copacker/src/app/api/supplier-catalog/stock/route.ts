import { and, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { supplierProducts } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { errorResponse, failureMessage, failureStatus } from "@/server/errors"
import { withRequest } from "@/server/next-request"
import { isAppOrigin } from "@/server/security"

const stockInput = z.strictObject({
  counts: z
    .array(z.strictObject({ id: z.uuid(), onHand: z.number().int().min(-2147483648).max(2147483647) }))
    .min(1)
    .max(5000)
})

// Saves the on hand counts changed on the Inventory page, all or none. A count replaces what was there, so it needs no
// revision: the supplier counted what's on the shelf now.
export const POST = withRequest(async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  try {
    const s = await session()
    if (s.org.kind !== "supplier") {
      return errorResponse("supplierWorkspaceRequired", 403)
    }
    requireAccess(s, "inventory", "edit")
    const { counts } = stockInput.parse(await request.json())
    const ids = counts.map((count) => count.id)
    if (new Set(ids).size !== ids.length) {
      throw new LocalizedError("variantCountedTwice")
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
      return errorResponse("variantNotTracked", 404)
    }
    return Response.json({ saved })
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "stockNotSaved") }, { status: failureStatus(error) })
  }
})
