import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { documents, shipments } from "@/db/schema"
import { accessibleOrder } from "@/server/access"
import { session } from "@/server/auth"
import { getFile } from "@/server/storage"
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
  if (s.org.kind === "supplier" && ["shipping_label", "carton_label"].includes(doc.kind) && doc.shipmentId) {
    const [shipment] = await db().select().from(shipments).where(eq(shipments.id, doc.shipmentId))
    if (!shipment || !["ready", "collected"].includes(shipment.status) || shipment.revision !== doc.shipmentRevision) {
      return new Response("Labels are awaiting buyer release", { status: 409 })
    }
  }
  const bytes = await getFile(doc.objectKey)
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
