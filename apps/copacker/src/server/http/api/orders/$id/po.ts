import { z } from "zod"
import { accessibleOrder } from "@/server/access"
import { requirePage, session } from "@/server/auth"
import { filedPo } from "@/server/documents"
import { errorResponse } from "@/server/errors"
import { fallbackResponse, fileResponse } from "@/server/http-response"

// The PO document, to download and share with a supplier that hasn't joined Copacker. Downloading serves the filed PDF
// rather than a fresh one, so it stays the document the purchase order's page links to.
export async function GET(_request: Request, context: { params: { id: string } }) {
  const id = z.uuid().safeParse(context.params.id)
  if (!id.success) {
    return errorResponse("orderNotFound", 404)
  }
  const s = await session()
  requirePage(s, "orders")
  requirePage(s, "prices")
  await accessibleOrder(s, id.data)
  try {
    const po = await filedPo(id.data)
    return fileResponse(Buffer.from(po.bytes), { filename: po.doc.name, contentType: "application/pdf" })
  } catch (error) {
    return fallbackResponse(error, "orderDocumentNotCreated")
  }
}
