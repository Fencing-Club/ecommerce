import { z } from "zod"
import { NotFoundError, AccessError } from "@/i18n/errors"
import { requirePage, session } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import { ProductBarcodeError, orderLabelsPdf } from "@/server/product-barcodes"

const headers = { "Cache-Control": "private, no-store" }

// All of a PO's current product labels as one PDF, in line order.
export async function GET(_request: Request, context: { params: { id: string } }) {
  const id = z.uuid().safeParse((await context.params).id)
  if (!id.success) {
    return errorResponse("orderNotFound", 404, headers)
  }
  const s = await session()
  requirePage(s, "orders")
  try {
    const file = await orderLabelsPdf(s, id.data)
    return new Response(Buffer.from(file.bytes), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox"
      }
    })
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof AccessError) {
      throw error
    }
    if (error instanceof ProductBarcodeError) {
      return Response.json({ error: await failureMessage(error) }, { status: error.status, headers })
    }
    return errorResponse("labelsNotCombined", 500, headers)
  }
}
