import { z } from "zod"
import { AccessError, NotFoundError } from "@/i18n/errors"
import { session } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import { ProductBarcodeError, shipmentLabelsPdf } from "@/server/product-barcodes"

const headers = { "Cache-Control": "private, no-store" }

// A shipment's product labels while it's packed: ?item= narrows them to one line, and ?kind= to its barcode label or
// the warning label sheet.
export async function GET(request: Request, context: { params: { id: string } }) {
  const query = new URL(request.url).searchParams
  const params = z
    .object({
      id: z.uuid(),
      item: z.uuid().optional(),
      kind: z.enum(["label", "warning", "all"]).default("all")
    })
    .safeParse({
      id: (await context.params).id,
      item: query.get("item") ?? undefined,
      kind: query.get("kind") ?? undefined
    })
  if (!params.success) {
    return errorResponse("labelNotFound", 404, headers)
  }
  const s = await session()
  try {
    const file = await shipmentLabelsPdf(s, params.data.id, { itemId: params.data.item, kind: params.data.kind })
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
