import { unstable_rethrow } from "next/navigation"
import { z } from "zod"
import { accessibleOrder } from "@/server/access"
import { requirePage, session } from "@/server/auth"
import { generatePo } from "@/server/documents"

const headers = { "Cache-Control": "private, no-store" }

// The PO document, to download and share with a supplier that hasn't joined Copacker.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await context.params).id)
  if (!id.success) {
    return Response.json({ error: "Purchase order not found" }, { status: 404, headers })
  }
  const s = await session()
  requirePage(s, "orders")
  requirePage(s, "prices")
  try {
    // Only a workspace that can see the PO gets its document.
    await accessibleOrder(s, id.data)
    const po = await generatePo(id.data)
    return new Response(Buffer.from(po.bytes), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(po.doc.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox"
      }
    })
  } catch (error) {
    unstable_rethrow(error)
    return Response.json({ error: "The purchase order couldn’t be created. Try again." }, { status: 500, headers })
  }
}
