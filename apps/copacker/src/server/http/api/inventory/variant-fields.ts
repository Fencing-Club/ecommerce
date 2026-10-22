import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { fallbackResponse } from "@/server/http-response"
import { saveVariantFields } from "@/server/product-fields"

// Saves a variation's supplier SKU, ASIN or stock targets, which Copacker keeps.
export async function PATCH(request: Request) {
  const s = await session()
  requirePage(s, "products", "edit")
  try {
    return Response.json(await saveVariantFields(s, await request.json()))
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse("checkValues", 400)
    }
    return fallbackResponse(error, "variantFieldsNotSaved")
  }
}
