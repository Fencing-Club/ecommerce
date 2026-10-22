import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { failureMessage, failureStatus } from "@/server/errors"
import { setProductsActive } from "@/server/supplier-products"

const statusInput = z.strictObject({ ids: z.array(z.uuid()).min(1).max(5000), active: z.boolean() })

// Archives or restores the products selected on the Products page. Archived products can't be ordered.
export async function POST(request: Request) {
  try {
    const input = statusInput.parse(await request.json())
    const s = await session()
    requireAccess(s, "products", "edit")
    return Response.json({ updated: await setProductsActive(s, input.ids, input.active) })
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "saveFailedShort") }, { status: failureStatus(error) })
  }
}
