import { productIdSchema } from "@repo/copacker-marketplaces/shopify"
import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { fallbackResponse, fileResponse } from "@/server/http-response"
import { productsLabelsPdf } from "@/server/product-barcodes"

const inputSchema = z.strictObject({
  productIds: z.array(productIdSchema).min(1).max(500)
})

// Labels for every variation of the chosen products as one PDF, one sheet each. X-Skipped-Labels counts the
// variations left out because they have no label yet.
export async function POST(request: Request) {
  const s = await session()
  requirePage(s, "products")
  const input = inputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) {
    return errorResponse("chooseProductsToLabel", 400)
  }
  try {
    const { bytes, skipped } = await productsLabelsPdf(s, input.data.productIds)
    const response = fileResponse(Buffer.from(bytes), {
      filename: "Product labels.pdf",
      contentType: "application/pdf"
    })
    response.headers.set("X-Skipped-Labels", String(skipped))
    return response
  } catch (error) {
    return fallbackResponse(error, "labelsNotMade")
  }
}
