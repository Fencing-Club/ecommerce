import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { documents, shipments } from "@/db/schema"
import { accessibleOrder } from "@/server/access"
import { session, requireMembership } from "@/server/auth"
import { getFile } from "@/server/storage"
async function labelsReleased(doc: typeof documents.$inferSelect) {
  if (!["shipping_label", "carton_label"].includes(doc.kind)) {
    return true
  }
  if (!doc.shipmentId) {
    return false
  }
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, doc.shipmentId))
  return !!shipment && ["ready", "collected"].includes(shipment.status) && shipment.revision === doc.shipmentRevision
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
  await accessibleOrder(s, doc.orderId)
  if (s.org.kind === "supplier" && !(await labelsReleased(doc))) {
    return new Response("Labels are awaiting buyer release", { status: 409 })
  }
  const bytes = await getFile(doc.objectKey)
  // Storage can be slow. Recheck withdrawal and access after fetching, before returning private bytes.
  await accessibleOrder(s, doc.orderId)
  const [current] = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.outdated, 0)))
  if (!current || current.objectKey !== doc.objectKey) {
    return new Response("Document changed. Refresh before downloading", { status: 409 })
  }
  if (s.org.kind === "supplier" && !(await labelsReleased(current))) {
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
