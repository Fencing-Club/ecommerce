import { and, eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { z } from "zod"
import { db } from "@/db"
import { documents, shipments } from "@/db/schema"
import { accessibleOrder, forwarderOrder } from "@/server/access"
import { type Session, session, requireMembership } from "@/server/auth"
import { releasedStates } from "@/server/readiness"
import { getFile } from "@/server/storage"
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
    await accessibleOrder(s, doc.orderId)
    return
  }
  await forwarderOrder(s, doc.orderId)
  if (!forwarderKinds.includes(doc.kind)) {
    notFound()
  }
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const s = await session(),
    id = z.uuid().parse((await context.params).id)
  const [doc] = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.outdated, 0)))
  if (!doc) {
    return new Response("Document not found", { status: 404 })
  }
  await canRead(s, doc)
  if (s.org.kind !== "buyer" && !(await labelsReleased(doc))) {
    return new Response("Labels are awaiting buyer release", { status: 409 })
  }
  const bytes = await getFile(doc.objectKey)
  // Storage can be slow. Recheck withdrawal and access after fetching, before returning private bytes.
  await canRead(s, doc)
  const [current] = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.outdated, 0)))
  if (!current || current.objectKey !== doc.objectKey) {
    return new Response("Document changed. Refresh before downloading", { status: 409 })
  }
  if (s.org.kind !== "buyer" && !(await labelsReleased(current))) {
    return new Response("Labels are awaiting buyer release", { status: 409 })
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
}
