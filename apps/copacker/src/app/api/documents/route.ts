import { randomUUID } from "node:crypto"
import { splitPdfPages } from "@repo/aisle/labels"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { documents, shipments } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { accessibleOrder } from "@/server/access"
import { session, requireAccess, requireBuyer } from "@/server/auth"
import { errorResponse, failureMessage, failureStatus } from "@/server/errors"
import { releasedStates } from "@/server/readiness"
import { isAppOrigin } from "@/server/security"
import { putFile, validatePdf } from "@/server/storage"

export async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  const s = await session()
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 34 * 1024 * 1024) {
      throw new LocalizedError("fileTooLarge")
    }
    const form = await request.formData(),
      orderId = z.uuid().parse(form.get("orderId"))
    const kind = z.enum(["invoice", "product_label", "shipping_label"]).parse(form.get("kind"))
    if (kind !== "invoice") {
      requireBuyer(s)
    }
    // A line's product label belongs to the purchase order; invoices and shipping labels to its shipments.
    requireAccess(s, kind === "product_label" ? "orders" : "shipments", "edit")
    const { order } = await accessibleOrder(s, orderId)
    const file = form.get("file")
    if (!(file instanceof File) || file.size > 32 * 1024 * 1024) {
      throw new LocalizedError("choosePdfUnder32")
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    await validatePdf(bytes)
    if (kind === "product_label" && (await splitPdfPages(bytes)).length !== 1) {
      throw new LocalizedError("uploadOneLabelSheet")
    }
    const shipmentId = form.get("shipmentId") ? z.uuid().parse(form.get("shipmentId")) : null
    const [shipment] = shipmentId
      ? await db()
          .select()
          .from(shipments)
          .where(and(eq(shipments.id, shipmentId), eq(shipments.orderId, orderId)))
      : []
    if (kind !== "product_label" && !shipment) {
      throw new LocalizedError("chooseDocumentShipment")
    }
    if (kind === "invoice" && shipment && !["packing", "correction"].includes(shipment.status)) {
      throw new LocalizedError("correctionBeforeInvoiceChange")
    }
    if (kind === "shipping_label" && shipment?.status !== "waiting_labels") {
      throw new LocalizedError("shipmentNotWaitingForLabels")
    }
    const itemId = kind === "product_label" ? z.uuid().parse(form.get("itemId")) : null
    if (itemId && !order.data.items.some((i) => i.id === itemId)) {
      throw new LocalizedError("productNotOnOrder")
    }
    const uploads: Array<{ data: Uint8Array; cartonId: string | null; name: string }> = []
    if (kind === "shipping_label") {
      const assignments = z
        .array(z.object({ cartonId: z.string(), page: z.number().int().positive() }))
        .min(1)
        .max(1000)
        .parse(JSON.parse(z.string().parse(form.get("assignments"))))
      if (
        new Set(assignments.map((a) => a.cartonId)).size !== assignments.length ||
        new Set(assignments.map((a) => a.page)).size !== assignments.length
      ) {
        throw new LocalizedError("labelAssignedOnce")
      }
      const pages = await splitPdfPages(bytes)
      for (const assignment of assignments) {
        const page = pages.find((p) => p.page === assignment.page)
        if (!page || !shipment?.packing?.cartons.some((c) => c.cartonId === assignment.cartonId)) {
          throw new LocalizedError("labelAssignmentUnknown")
        }
        uploads.push({
          data: page.data,
          cartonId: assignment.cartonId,
          name: `Shipping label - ${assignment.cartonId}.pdf`
        })
      }
    } else {
      uploads.push({ data: bytes, cartonId: null, name: file.name.replace(/[^a-zA-Z0-9 ._-]/g, "_").slice(0, 180) })
    }
    const staged: Array<typeof documents.$inferInsert> = []
    for (const upload of uploads) {
      const id = randomUUID(),
        objectKey = `orders/${orderId}/${id}.pdf`
      await putFile(objectKey, upload.data)
      staged.push({
        id,
        orderId,
        shipmentId,
        kind,
        itemId,
        cartonId: upload.cartonId,
        objectKey,
        name: upload.name,
        bytes: upload.data.length,
        orderRevision: order.revision,
        shipmentRevision: shipment?.revision ?? null,
        uploadedBy: s.user.id
      })
    }
    await db().transaction(async (tx) => {
      const { order: fresh } = await accessibleOrder(s, orderId, tx, true)
      if (fresh.revision !== order.revision) {
        throw new LocalizedError("orderChangedDuringUpload")
      }
      if (kind === "product_label") {
        const existing = await tx.select().from(shipments).where(eq(shipments.orderId, orderId))
        if (
          existing.some(
            (row) =>
              releasedStates.includes(row.status) &&
              row.packing?.cartons.some((c) => c.items.some((i) => i.itemId === itemId))
          )
        ) {
          throw new LocalizedError("productLabelReleased")
        }
      }
      if (shipmentId) {
        const [freshShipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
        if (freshShipment?.revision !== shipment?.revision || freshShipment?.status !== shipment?.status) {
          throw new LocalizedError("shipmentChangedDuringUpload")
        }
      }
      for (const document of staged) {
        if (kind === "shipping_label") {
          await tx
            .update(documents)
            .set({ outdated: 1 })
            .where(
              and(
                eq(documents.shipmentId, shipmentId!),
                eq(documents.kind, kind),
                eq(documents.cartonId, document.cartonId!)
              )
            )
        }
        if (kind === "invoice") {
          await tx
            .update(documents)
            .set({ outdated: 1 })
            .where(and(eq(documents.shipmentId, shipmentId!), eq(documents.kind, "invoice")))
        }
        if (kind === "product_label") {
          await tx
            .update(documents)
            .set({ outdated: 1 })
            .where(and(eq(documents.orderId, orderId), eq(documents.kind, kind), eq(documents.itemId, itemId!)))
        }
      }
      await tx.insert(documents).values(staged)
    })
    return Response.json({ documents: staged.map((d) => ({ id: d.id, name: d.name })) })
  } catch (error) {
    return Response.json(
      { error: await failureMessage(error, "documentUploadFailed") },
      { status: failureStatus(error) }
    )
  }
}
