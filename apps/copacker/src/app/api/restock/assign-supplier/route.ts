import { ZodError } from "zod"
import { requirePage, session } from "@/server/auth"
import { ProductDefaultsError, assignProductSupplier } from "@/server/product-defaults"
import { isAppOrigin } from "@/server/security"

// Sets the supplier for several products at once, from restock.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (!isAppOrigin(request.headers.get("origin"))) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers })
  }
  const s = await session()
  requirePage(s, "products", "edit")
  try {
    return Response.json(await assignProductSupplier(s, await request.json()), { headers })
  } catch (error) {
    if (error instanceof ProductDefaultsError) {
      return Response.json({ error: error.message }, { status: error.status, headers })
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Choose products and a supplier" }, { status: 400, headers })
    }
    return Response.json({ error: "The supplier couldn’t be saved. Try again." }, { status: 500, headers })
  }
}
