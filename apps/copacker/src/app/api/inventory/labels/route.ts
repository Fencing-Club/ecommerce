import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import { withRequest } from "@/server/next-request"
import { ProductBarcodeError, productsLabelsPdf } from "@/server/product-barcodes"
import { isAppOrigin } from "@/server/security"

const headers = { "Cache-Control": "private, no-store" }

const inputSchema = z.strictObject({
  productIds: z
    .array(z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/))
    .min(1)
    .max(500)
})

// Labels for every variation of the chosen products as one PDF, one sheet each. X-Skipped-Labels counts the
// variations left out because they have no label yet.
export const POST = withRequest(async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403, headers)
  }
  const s = await session()
  requirePage(s, "products")
  const input = inputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) {
    return errorResponse("chooseProductsToLabel", 400, headers)
  }
  try {
    const { bytes, skipped } = await productsLabelsPdf(s, input.data.productIds)
    return new Response(Buffer.from(bytes), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("Product labels.pdf")}`,
        "X-Content-Type-Options": "nosniff",
        "X-Skipped-Labels": String(skipped)
      }
    })
  } catch (error) {
    if (error instanceof ProductBarcodeError) {
      return Response.json({ error: await failureMessage(error) }, { status: error.status, headers })
    }
    return errorResponse("labelsNotMade", 500, headers)
  }
})
