import { requirePage, session } from "@/server/auth"
import { saveVariantFields, VariantFieldsError } from "@/server/product-fields"
import { appUrl } from "@/server/security"

// Saves a variation's supplier SKU, ASIN or stock targets, which Copacker keeps.
export async function PATCH(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers })
  }
  const s = await session()
  requirePage(s, "products", "edit")
  try {
    return Response.json(await saveVariantFields(s, await request.json()), { headers })
  } catch (error) {
    if (error instanceof VariantFieldsError) {
      return Response.json({ error: error.message }, { status: error.status, headers })
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Check the values and try again" }, { status: 400, headers })
    }
    return Response.json({ error: "The product details couldn't be saved. Try again." }, { status: 500, headers })
  }
}
