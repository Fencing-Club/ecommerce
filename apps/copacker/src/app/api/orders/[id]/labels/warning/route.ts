import { unstable_rethrow } from "next/navigation"
import { z } from "zod"
import { accessibleOrder } from "@/server/access"
import { session } from "@/server/auth"
import { warningLabelFile } from "@/server/product-barcodes"

const headers = { "Cache-Control": "private, no-store" }

// The PO's sheet of suffocation warning labels, when any of its lines needs them.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await context.params).id)
  if (!id.success) {
    return Response.json({ error: "Purchase order not found" }, { status: 404, headers })
  }
  const s = await session()
  try {
    const { order } = await accessibleOrder(s, id.data)
    const file = await warningLabelFile(order.data.items)
    if (!file) {
      return Response.json({ error: "No line on this purchase order needs warning labels" }, { status: 404, headers })
    }
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
    return Response.json({ error: "The warning labels couldn’t be made. Try again." }, { status: 500, headers })
  }
}
