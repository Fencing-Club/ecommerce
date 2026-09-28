import { unstable_rethrow } from "next/navigation"
import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { ProductBarcodeError, orderLineLabel } from "@/server/product-barcodes"

const headers = { "Cache-Control": "private, no-store" }

// One PO line's product label, made from its product's current label.
export async function GET(_request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  const params = z.object({ id: z.uuid(), itemId: z.uuid() }).safeParse(await context.params)
  if (!params.success) {
    return Response.json({ error: "Label not found" }, { status: 404, headers })
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
    // Lets a PO the workspace can't see become Next's not-found response.
    unstable_rethrow(error)
    if (error instanceof ProductBarcodeError) {
      return Response.json({ error: error.message }, { status: error.status, headers })
    }
    return Response.json({ error: "The label couldn’t be made. Try again." }, { status: 500, headers })
  }
}
