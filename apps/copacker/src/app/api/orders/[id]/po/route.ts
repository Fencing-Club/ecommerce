import { unstable_rethrow } from "next/navigation"
import { z } from "zod"
import { accessibleOrder } from "@/server/access"
import { requirePage, session } from "@/server/auth"
import { filedPo } from "@/server/documents"
import { errorResponse } from "@/server/errors"
import { withRequest } from "@/server/next-request"

const headers = { "Cache-Control": "private, no-store" }

// The PO document, to download and share with a supplier that hasn't joined Copacker. Downloading serves the filed PDF
// rather than a fresh one, so it stays the document the purchase order's page links to.
export const GET = withRequest(async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await context.params).id)
  if (!id.success) {
    return errorResponse("orderNotFound", 404, headers)
  }
  const s = await session()
  requirePage(s, "orders")
  requirePage(s, "prices")
  try {
    // Only a workspace that can see the PO gets its document.
    await accessibleOrder(s, id.data)
    const po = await filedPo(id.data)
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
    return errorResponse("orderDocumentNotCreated", 500, headers)
  }
})
