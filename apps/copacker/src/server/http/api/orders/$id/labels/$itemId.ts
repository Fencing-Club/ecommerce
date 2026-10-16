import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import { ProductBarcodeError, orderLineLabel } from "@/server/product-barcodes"

const headers = { "Cache-Control": "private, no-store" }

// One PO line's product label, made from its product's current label.
export async function GET(_request: Request, context: { params: { id: string; itemId: string } }) {
  const params = z.object({ id: z.uuid(), itemId: z.uuid() }).safeParse(await context.params)
  if (!params.success) {
    return errorResponse("labelNotFound", 404, headers)
  }
  const s = await session()
  requirePage(s, "orders")
  try {
    const file = await orderLineLabel(s, params.data.id, params.data.itemId)
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
    // A purchase order outside this workspace produces the route's not-found response.
    if (error instanceof ProductBarcodeError) {
      return Response.json({ error: await failureMessage(error) }, { status: error.status, headers })
    }
    return errorResponse("labelNotMade", 500, headers)
  }
}
