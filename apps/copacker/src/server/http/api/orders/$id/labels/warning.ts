import { z } from "zod"
import { accessibleOrder } from "@/server/access"
import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { fallbackResponse, fileResponse } from "@/server/http-response"
import { warningLabelFile } from "@/server/product-barcodes"

// The PO's sheet of suffocation warning labels, when any of its lines needs them.
export async function GET(_request: Request, context: { params: { id: string } }) {
  const id = z.uuid().safeParse(context.params.id)
  if (!id.success) {
    return errorResponse("orderNotFound", 404)
  }
  const s = await session()
  requirePage(s, "orders")
  const { order } = await accessibleOrder(s, id.data)
  try {
    const file = await warningLabelFile(order.data.items)
    if (!file) {
      return errorResponse("noWarningLabels", 404)
    }
    return fileResponse(Buffer.from(file.bytes), { filename: file.name, contentType: "application/pdf" })
  } catch (error) {
    return fallbackResponse(error, "warningLabelsNotMade")
  }
}
