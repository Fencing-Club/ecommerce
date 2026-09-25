import { ZodError } from "zod"
import { session } from "@/server/auth"
import { ProductDefaultsError, saveProductDefaults } from "@/server/product-defaults"
import { appUrl } from "@/server/security"

// Saves a product's default description and preparation for new PO lines.
export async function PATCH(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers })
  }
  const s = await session()
  try {
    return Response.json(await saveProductDefaults(s, await request.json()), { headers })
  } catch (error) {
    if (error instanceof ProductDefaultsError) {
      return Response.json({ error: error.message }, { status: error.status, headers })
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Check the product details and try again" }, { status: 400, headers })
    }
    return Response.json({ error: "Product details couldn't be saved. Try again." }, { status: 500, headers })
  }
}
