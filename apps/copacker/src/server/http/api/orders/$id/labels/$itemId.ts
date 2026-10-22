import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { fallbackResponse, fileResponse } from "@/server/http-response"
import { orderLineLabel } from "@/server/product-barcodes"

// One PO line's product label, made from its product's current label.
export async function GET(_request: Request, context: { params: { id: string; itemId: string } }) {
  const params = z.object({ id: z.uuid(), itemId: z.uuid() }).safeParse(context.params)
  if (!params.success) {
    return errorResponse("labelNotFound", 404)
  }
  const s = await session()
  requirePage(s, "orders")
  try {
    const file = await orderLineLabel(s, params.data.id, params.data.itemId)
    return fileResponse(Buffer.from(file.bytes), { filename: file.name, contentType: "application/pdf" })
  } catch (error) {
    // A purchase order outside this workspace produces the route's not-found response.
    return fallbackResponse(error, "labelNotMade")
  }
}
