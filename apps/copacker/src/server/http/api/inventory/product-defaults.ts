import { ZodError } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { fallbackResponse } from "@/server/http-response"
import { saveProductDefaults } from "@/server/product-defaults"

// Saves a product's default description and preparation for new PO lines.
export async function PATCH(request: Request) {
  const s = await session()
  requirePage(s, "products", "edit")
  try {
    return Response.json(await saveProductDefaults(s, await request.json()))
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return errorResponse("checkProductDetails", 400)
    }
    return fallbackResponse(error, "productDetailsNotSaved")
  }
}
