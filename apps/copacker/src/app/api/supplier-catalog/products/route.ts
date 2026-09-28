import { requireAccess, session } from "@/server/auth"
import { AccessError } from "@/server/errors"
import { appUrl } from "@/server/security"
import { saveProduct } from "@/server/supplier-products"

// Creates or saves a product and its variants from the product page.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const s = await session()
    requireAccess(s, "products", "edit")
    return Response.json(await saveProduct(s, await request.json()))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save product"
    if (error instanceof AccessError) {
      return Response.json({ error: message }, { status: 403 })
    }
    return Response.json({ error: message }, { status: message.includes("changed") ? 409 : 400 })
  }
}
