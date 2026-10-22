import { z } from "zod"
import { session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { fallbackResponse, fileResponse } from "@/server/http-response"
import { shipmentLabelsPdf } from "@/server/product-barcodes"

// A shipment's product labels while it's packed: ?item= narrows them to one line, and ?kind= to one label type.
export async function GET(request: Request, context: { params: { id: string } }) {
  const query = new URL(request.url).searchParams
  const params = z
    .object({
      id: z.uuid(),
      item: z.uuid().optional(),
      kind: z.enum(["sku", "fnsku", "suffocation", "all"]).default("all")
    })
    .safeParse({
      id: (await context.params).id,
      item: query.get("item") ?? undefined,
      kind: query.get("kind") ?? undefined
    })
  if (!params.success) {
    return errorResponse("labelNotFound", 404)
  }
  const s = await session()
  try {
    const file = await shipmentLabelsPdf(s, params.data.id, { itemId: params.data.item, kind: params.data.kind })
    return fileResponse(Buffer.from(file.bytes), { filename: file.name, contentType: "application/pdf" })
  } catch (error) {
    return fallbackResponse(error, "labelsNotCombined")
  }
}
