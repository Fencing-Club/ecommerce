import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { fallbackResponse, fileResponse } from "@/server/http-response"
import { orderLabelsPdf } from "@/server/product-barcodes"

// All of a PO's current product labels as one PDF, in line order.
export async function GET(_request: Request, context: { params: { id: string } }) {
  const id = z.uuid().safeParse((await context.params).id)
  if (!id.success) {
    return errorResponse("orderNotFound", 404)
  }
  const s = await session()
  requirePage(s, "orders")
  try {
    const file = await orderLabelsPdf(s, id.data)
    return fileResponse(Buffer.from(file.bytes), { filename: file.name, contentType: "application/pdf" })
  } catch (error) {
    return fallbackResponse(error, "labelsNotCombined")
  }
}
