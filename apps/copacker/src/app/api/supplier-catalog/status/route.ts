import { z } from "zod"
import { requireAccess, session } from "@/server/auth"
import { failureStatus } from "@/server/errors"
import { isAppOrigin } from "@/server/security"
import { setProductsActive } from "@/server/supplier-products"

const statusInput = z.strictObject({ ids: z.array(z.uuid()).min(1).max(5000), active: z.boolean() })

// Archives or restores the products selected on the Products page. Archived products can't be ordered.
export async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const input = statusInput.parse(await request.json())
    const s = await session()
    requireAccess(s, "products", "edit")
    return Response.json({ updated: await setProductsActive(s, input.ids, input.active) })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save" },
      { status: failureStatus(error) }
    )
  }
}
