import { z } from "zod"
import { session } from "@/server/auth"
import { appUrl } from "@/server/security"
import { setProductsActive } from "@/server/supplier-products"

const statusInput = z.strictObject({ ids: z.array(z.uuid()).min(1).max(5000), active: z.boolean() })

// Archives or restores the products selected on the Products page. Archived products can't be ordered.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const input = statusInput.parse(await request.json())
    return Response.json({ updated: await setProductsActive(await session(), input.ids, input.active) })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save" }, { status: 400 })
  }
}
