import { ZodError } from "zod"
import { requirePage, session } from "@/server/auth"
import { ProductBarcodeError, productLabelChoices } from "@/server/product-barcodes"
import { ProductDefaultsError, assignProductLabel } from "@/server/product-defaults"
import { isAppOrigin } from "@/server/security"

const headers = { "Cache-Control": "private, no-store" }

// Every product with its label type, for choosing several at once.
export async function GET() {
  const s = await session()
  requirePage(s, "products")
  try {
    return Response.json(await productLabelChoices(s), { headers })
  } catch (error) {
    if (error instanceof ProductBarcodeError) {
      return Response.json({ error: error.message }, { status: error.status, headers })
    }
    return Response.json({ error: "Products couldn’t be loaded. Try again." }, { status: 500, headers })
  }
}

// Sets the label type for several products at once: { productIds, productLabel: "standard" | "uploaded" }.
export async function PATCH(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers })
  }
  const s = await session()
  requirePage(s, "products", "edit")
  try {
    return Response.json(await assignProductLabel(s, await request.json()), { headers })
  } catch (error) {
    if (error instanceof ProductDefaultsError) {
      return Response.json({ error: error.message }, { status: error.status, headers })
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Choose products and a label type" }, { status: 400, headers })
    }
    return Response.json({ error: "The label type couldn’t be saved. Try again." }, { status: 500, headers })
  }
}
