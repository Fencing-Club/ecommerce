import { unstable_rethrow } from "next/navigation"
import { z } from "zod"
import { session } from "@/server/auth"
import { ProductBarcodeError, orderLabelsPdf } from "@/server/product-barcodes"

const headers = { "Cache-Control": "private, no-store" }

// All of a PO's current product labels as one PDF, in line order.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await context.params).id)
  if (!id.success) {
    return Response.json({ error: "PO not found" }, { status: 404, headers })
  }
  const s = await session()
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
    // Lets a PO the workspace can't see become Next's not-found response.
    unstable_rethrow(error)
    if (error instanceof ProductBarcodeError) {
      return Response.json({ error: error.message }, { status: error.status, headers })
    }
    return Response.json({ error: "The labels couldn’t be combined. Try again." }, { status: 500, headers })
  }
}
