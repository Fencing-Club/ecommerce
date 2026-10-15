import { ZodError } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import { withRequest } from "@/server/next-request"
import { ProductBarcodeError, productLabelChoices } from "@/server/product-barcodes"
import { ProductDefaultsError, assignProductLabel } from "@/server/product-defaults"
import { isAppOrigin } from "@/server/security"

const headers = { "Cache-Control": "private, no-store" }

// Every product with its label type, for choosing several at once.
export const GET = withRequest(async function GET() {
  const s = await session()
  requirePage(s, "products")
  try {
    return Response.json(await productLabelChoices(s), { headers })
  } catch (error) {
    if (error instanceof ProductBarcodeError) {
      return Response.json({ error: await failureMessage(error) }, { status: error.status, headers })
    }
    return errorResponse("productsNotLoaded", 500, headers)
  }
})

// Sets the label type for several products at once: { productIds, productLabel: "standard" | "uploaded" }.
export const PATCH = withRequest(async function PATCH(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403, headers)
  }
  const s = await session()
  requirePage(s, "products", "edit")
  try {
    return Response.json(await assignProductLabel(s, await request.json()), { headers })
  } catch (error) {
    if (error instanceof ProductDefaultsError) {
      return Response.json({ error: await failureMessage(error) }, { status: error.status, headers })
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return errorResponse("chooseProductsAndLabelType", 400, headers)
    }
    return errorResponse("labelTypeNotSaved", 500, headers)
  }
})
