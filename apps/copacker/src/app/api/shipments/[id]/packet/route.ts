import { combinePdfs } from "@repo/aisle/documents"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { shipments, documents } from "@/db/schema"
import { accessibleOrder } from "@/server/access"
import { session, requirePage } from "@/server/auth"
import { packingDocuments } from "@/server/documents"
import { errorTextResponse } from "@/server/errors"
import { withRequest } from "@/server/next-request"
import { lineLabelFiles, lineLabels, warningLabelFile } from "@/server/product-barcodes"
import { releaseIssues } from "@/server/readiness"
import { releasedStates } from "@/server/readiness"
import { getFile } from "@/server/storage"
import { requireMembership } from "@/server/workspace-session"
// The supplier's packet, to print: the packing list and checklist, the product labels and suffocation warning labels
// for the lines it carries, then, for a shipment to Amazon, Amazon's carton labels and the buyer's shipping labels.
export const GET = withRequest(async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const s = await session(),
    id = z.uuid().parse((await context.params).id)
  requirePage(s, "shipments")
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id))
  if (!shipment) {
    return errorTextResponse("shipmentNotFound", 404)
  }
  const { order } = await accessibleOrder(s, shipment.orderId)
  if (!releasedStates.includes(shipment.status)) {
    return errorTextResponse("packetNotReleased", 409)
  }
  const docs = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.orderId, shipment.orderId), eq(documents.outdated, 0)))
  // Product labels are made from each product now, for the lines this shipment carries.
  const labels = await lineLabels(order)
  const missingLabels = new Set(labels.flatMap((label) => (label.state === "missing" ? [label.itemId] : [])))
  if (releaseIssues(shipment, docs, missingLabels).length) {
    return errorTextResponse("packetIncomplete", 409)
  }
  const itemIds = new Set(shipment.packing?.cartons.flatMap((c) => c.items.map((i) => i.itemId)))
  // A shipment to Amazon keeps its packing list and checklist, made with Amazon's carton labels, and its carton and
  // shipping labels. Any other shipment has neither kind of label, and its packing list and checklist are made from its
  // packing now.
  const amazon = shipment.snapshot?.destination === "amazon"
  const selected = amazon
    ? docs.filter(
        (d) =>
          d.shipmentId === id &&
          d.shipmentRevision === shipment.revision &&
          ["packing_list", "checklist", "carton_label", "shipping_label"].includes(d.kind)
      )
    : []
  const byKind = (kind: string) =>
    selected
      .filter((d) => d.kind === kind)
      .toSorted((a, b) => (a.cartonId ?? a.name).localeCompare(b.cartonId ?? b.name, undefined, { numeric: true }))
  const file = (d: (typeof selected)[number]) => getFile(d.objectKey)
  const packing = amazon
    ? await Promise.all([...byKind("packing_list"), ...byKind("checklist")].map(file))
    : await packingDocuments(shipment).then((made) => [made.packingList, made.checklist])
  const productLabels = await lineLabelFiles(
    order,
    labels.filter((label) => itemIds.has(label.itemId))
  )
  const warnings = await warningLabelFile(
    (shipment.snapshot ?? order.data).items.filter((item) => itemIds.has(item.id))
  )
  const result = await combinePdfs([
    ...packing,
    ...productLabels.map((label) => label.bytes),
    ...(warnings ? [warnings.bytes] : []),
    ...(await Promise.all([...byKind("carton_label"), ...byKind("shipping_label")].map(file)))
  ])
  await accessibleOrder(s, shipment.orderId)
  const [current] = await db().select().from(shipments).where(eq(shipments.id, id))
  if (!current || !releasedStates.includes(current.status) || current.revision !== shipment.revision) {
    return errorTextResponse("packetChanged", 409)
  }
  const currentDocs = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.orderId, shipment.orderId), eq(documents.outdated, 0)))
  if (
    releaseIssues(current, currentDocs, missingLabels).length ||
    selected.some(
      (doc) => !currentDocs.some((currentDoc) => currentDoc.id === doc.id && currentDoc.objectKey === doc.objectKey)
    )
  ) {
    return errorTextResponse("shipmentDocumentsChanged", 409)
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
})
