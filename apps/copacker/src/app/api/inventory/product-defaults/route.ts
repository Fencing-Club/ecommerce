import { ZodError } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import { withRequest } from "@/server/next-request"
import { ProductDefaultsError, saveProductDefaults } from "@/server/product-defaults"
import { isAppOrigin } from "@/server/security"

// Saves a product's default description and preparation for new PO lines.
export const PATCH = withRequest(async function PATCH(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403, headers)
  }
  const s = await session()
  requirePage(s, "products", "edit")
  try {
    return Response.json(await saveProductDefaults(s, await request.json()), { headers })
  } catch (error) {
    if (error instanceof ProductDefaultsError) {
      return Response.json({ error: await failureMessage(error) }, { status: error.status, headers })
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return errorResponse("checkProductDetails", 400, headers)
    }
    return errorResponse("productDetailsNotSaved", 500, headers)
  }
})
