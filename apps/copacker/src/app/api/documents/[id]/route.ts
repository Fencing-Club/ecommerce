import { and, eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { z } from "zod"
import { db } from "@/db"
import { documents, shipments } from "@/db/schema"
import { accessibleOrder, forwarderOrder } from "@/server/access"
import { session, requirePage } from "@/server/auth"
import { errorTextResponse } from "@/server/errors"
import { withRequest } from "@/server/next-request"
import { releasedStates } from "@/server/readiness"
import { getFile } from "@/server/storage"
import { type Session, requireMembership } from "@/server/workspace-session"
async function labelsReleased(doc: typeof documents.$inferSelect) {
  if (!["shipping_label", "carton_label"].includes(doc.kind)) {
    return true
  }
  if (!doc.shipmentId) {
    return false
  }
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, doc.shipmentId))
  return !!shipment && releasedStates.includes(shipment.status) && shipment.revision === doc.shipmentRevision
}
// A forwarder reads a PO's shipping documents, but not the PO itself or its product labels, which carry prices or
// are the supplier's to apply.
const forwarderKinds = ["invoice", "packing_list", "carton_label", "shipping_label"]
async function canRead(s: Session, doc: typeof documents.$inferSelect) {
  if (s.org.kind !== "forwarder") {
    // The purchase order's own documents belong to its page; invoices, packing lists and labels to its shipments.
    // The purchase order and the commercial invoice are priced.
    requirePage(s, ["purchase_order", "product_label"].includes(doc.kind) ? "orders" : "shipments")
    if (["purchase_order", "invoice"].includes(doc.kind)) {
      requirePage(s, "prices")
    }
    await accessibleOrder(s, doc.orderId)
    return
  }
  requirePage(s, "orders")
  await forwarderOrder(s, doc.orderId)
  if (!forwarderKinds.includes(doc.kind)) {
    notFound()
  }
}
export const GET = withRequest(async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const s = await session(),
    id = z.uuid().parse((await context.params).id)
  const [doc] = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.outdated, 0)))
  if (!doc) {
    return errorTextResponse("documentNotFound", 404)
  }
  await canRead(s, doc)
  if (s.org.kind !== "buyer" && !(await labelsReleased(doc))) {
    return errorTextResponse("labelsAwaitingRelease", 409)
  }
  const bytes = await getFile(doc.objectKey)
  // Storage can be slow. Recheck withdrawal and access after fetching, before returning private bytes.
  await canRead(s, doc)
  const [current] = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.outdated, 0)))
  if (!current || current.objectKey !== doc.objectKey) {
    return errorTextResponse("documentChanged", 409)
  }
  if (s.org.kind !== "buyer" && !(await labelsReleased(current))) {
    return errorTextResponse("labelsAwaitingRelease", 409)
  }
  await requireMembership(s.user.id, s.org.id)
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox"
    }
  })
})
