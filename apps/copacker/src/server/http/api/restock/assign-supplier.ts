import { ZodError } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { fallbackResponse } from "@/server/http-response"
import { assignProductSupplier } from "@/server/product-defaults"

// Sets the supplier for several products at once, from restock.
export async function POST(request: Request) {
  const s = await session()
  requirePage(s, "products", "edit")
  try {
    return Response.json(await assignProductSupplier(s, await request.json()))
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return errorResponse("chooseProductsAndSupplier", 400)
    }
    return fallbackResponse(error, "supplierNotSaved")
  }
}
