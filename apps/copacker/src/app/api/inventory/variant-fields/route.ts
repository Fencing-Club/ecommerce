import { requirePage, session } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import { withRequest } from "@/server/next-request"
import { saveVariantFields, VariantFieldsError } from "@/server/product-fields"
import { isAppOrigin } from "@/server/security"

// Saves a variation's supplier SKU, ASIN or stock targets, which Copacker keeps.
export const PATCH = withRequest(async function PATCH(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403, headers)
  }
  const s = await session()
  requirePage(s, "products", "edit")
  try {
    return Response.json(await saveVariantFields(s, await request.json()), { headers })
  } catch (error) {
    if (error instanceof VariantFieldsError) {
      return Response.json({ error: await failureMessage(error) }, { status: error.status, headers })
    }
    if (error instanceof SyntaxError) {
      return errorResponse("checkValues", 400, headers)
    }
    return errorResponse("variantFieldsNotSaved", 500, headers)
  }
})
