import { combinePdfs } from "@repo/aisle/documents"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { shipments, documents } from "@/db/schema"
import { accessibleOrder } from "@/server/access"
import { session, requireMembership } from "@/server/auth"
import { releaseIssues } from "@/server/readiness"
import { getFile } from "@/server/storage"
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const s = await session(),
    id = z.uuid().parse((await context.params).id)
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id))
  if (!shipment) {
    return new Response("Shipment not found", { status: 404 })
  }
  await accessibleOrder(s, shipment.orderId)
  if (!["ready", "collected"].includes(shipment.status)) {
    return new Response("Shipment packet has not been released", { status: 409 })
  }
  const docs = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.orderId, shipment.orderId), eq(documents.outdated, 0)))
  if (releaseIssues(shipment, docs).length) {
    return new Response("Shipment packet is incomplete. Ask the buyer to review its documents", { status: 409 })
  }
  const itemIds = new Set(shipment.packing?.cartons.flatMap((c) => c.items.map((i) => i.itemId)))
  const selected = docs.filter(
    (d) =>
      (d.shipmentId === id &&
        d.shipmentRevision === shipment.revision &&
        ["packing_list", "checklist", "carton_label", "shipping_label"].includes(d.kind)) ||
      (d.kind === "product_label" && d.itemId && itemIds.has(d.itemId))
  )
  const priority = ["packing_list", "checklist", "product_label", "carton_label", "shipping_label"]
  selected.sort(
    (a, b) =>
      priority.indexOf(a.kind) - priority.indexOf(b.kind) ||
      (a.cartonId ?? a.name).localeCompare(b.cartonId ?? b.name, undefined, { numeric: true })
  )
  const result = await combinePdfs(await Promise.all(selected.map((d) => getFile(d.objectKey))))
  await accessibleOrder(s, shipment.orderId)
  const [current] = await db().select().from(shipments).where(eq(shipments.id, id))
  if (!current || !["ready", "collected"].includes(current.status) || current.revision !== shipment.revision) {
    return new Response("Shipment packet changed. Refresh before downloading", { status: 409 })
  }
  const currentDocs = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.orderId, shipment.orderId), eq(documents.outdated, 0)))
  if (
    releaseIssues(current, currentDocs).length ||
    selected.some(
      (doc) => !currentDocs.some((currentDoc) => currentDoc.id === doc.id && currentDoc.objectKey === doc.objectKey)
    )
  ) {
    return new Response("Shipment documents changed. Refresh before downloading", { status: 409 })
  }
  await requireMembership(s.user.id, s.org.id)
  return new Response(Buffer.from(result), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Supplier packet.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox"
    }
  })
}
