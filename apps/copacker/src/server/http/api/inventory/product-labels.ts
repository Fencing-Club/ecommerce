import { ZodError } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { fallbackResponse } from "@/server/http-response"
import { productLabelChoices } from "@/server/product-barcodes"
import { assignProductLabel } from "@/server/product-defaults"

// Every product with its label type, for choosing several at once.
export async function GET() {
  const s = await session()
  requirePage(s, "products")
  try {
    return Response.json(await productLabelChoices(s))
  } catch (error) {
    return fallbackResponse(error, "productsNotLoaded")
  }
}

// Sets the label type for several products at once: { productIds, productLabel: "standard" | "uploaded" }.
export async function PATCH(request: Request) {
  const s = await session()
  requirePage(s, "products", "edit")
  try {
    return Response.json(await assignProductLabel(s, await request.json()))
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return errorResponse("chooseProductsAndLabelType", 400)
    }
    return fallbackResponse(error, "labelTypeNotSaved")
  }
}
