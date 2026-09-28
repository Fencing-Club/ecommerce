import { ZodError } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import { ProductDefaultsError, assignProductSupplier } from "@/server/product-defaults"
import { isAppOrigin } from "@/server/security"

// Sets the supplier for several products at once, from restock.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403, headers)
  }
  const s = await session()
  requirePage(s, "products", "edit")
  try {
    return Response.json(await assignProductSupplier(s, await request.json()), { headers })
  } catch (error) {
    if (error instanceof ProductDefaultsError) {
      return Response.json({ error: await failureMessage(error) }, { status: error.status, headers })
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return errorResponse("chooseProductsAndSupplier", 400, headers)
    }
    return errorResponse("supplierNotSaved", 500, headers)
  }
}
