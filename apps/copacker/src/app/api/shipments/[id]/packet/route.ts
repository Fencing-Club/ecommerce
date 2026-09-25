import { combinePdfs } from "@repo/aisle/documents"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { shipments, documents } from "@/db/schema"
import { accessibleOrder } from "@/server/access"
import { session } from "@/server/auth"
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
  return new Response(Buffer.from(result), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Supplier packet.pdf"`,
      "Cache-Control": "private, no-store"
    }
  })
}
