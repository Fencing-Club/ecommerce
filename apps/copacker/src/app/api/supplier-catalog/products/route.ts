import { session } from "@/server/auth"
import { appUrl } from "@/server/security"
import { saveProduct } from "@/server/supplier-products"

// Creates or saves a product and its variants from the product page.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    return Response.json(await saveProduct(await session(), await request.json()))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save product"
    return Response.json({ error: message }, { status: message.includes("changed") ? 409 : 400 })
  }
}
