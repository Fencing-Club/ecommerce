import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { requestInput, requestJson } from "@/server/errors"
import { setProductsActive } from "@/server/supplier-products"

const statusInput = z.strictObject({ ids: z.array(z.uuid()).min(1).max(5000), active: z.boolean() })

// Archives or restores the products selected on the Products page. Archived products can't be ordered.
export async function POST(request: Request) {
  const input = requestInput(statusInput, await requestJson(request))
  const s = await session()
  requireAccess(s, "products", "edit")
  return Response.json({ updated: await setProductsActive(s, input.ids, input.active) })
}
