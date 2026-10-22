import { randomUUID } from "node:crypto"
import { splitPdfPages } from "@repo/copacker-shipments/labels"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { documents, shipments } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { accessibleOrder } from "@/server/access"
import { session } from "@/server/auth"
import { requireAccess, requireBuyer } from "@/server/authorization"
import { failureMessage, failureStatus } from "@/server/errors"
import { releasedStates } from "@/server/readiness"
import { putFile, validatePdf } from "@/server/storage"

export async function POST(request: Request) {
  const s = await session()
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 34 * 1024 * 1024) {
      throw new LocalizedError("fileTooLarge")
    }
    const form = await request.formData(),
      orderId = z.uuid().parse(form.get("orderId"))
    // Invoices and product labels belong to the PO. A shipment's carrier labels have their own route.
    const kind = z.enum(["invoice", "product_label"]).parse(form.get("kind"))
    if (kind !== "invoice") {
      requireBuyer(s)
    }
    requireAccess(s, "orders", "edit")
    if (kind === "invoice") {
      requireAccess(s, "prices")
    }
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
    const itemId = kind === "product_label" ? z.uuid().parse(form.get("itemId")) : null
    if (itemId && !order.data.items.some((i) => i.id === itemId)) {
      throw new LocalizedError("productNotOnOrder")
    }
    const name = file.name.replace(/[^a-zA-Z0-9 ._-]/g, "_").slice(0, 180)
    const id = randomUUID(),
      objectKey = `orders/${orderId}/${id}.pdf`
    await putFile(objectKey, bytes)
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
      // The new file replaces the order's invoice, or the line's product label.
      await tx
        .update(documents)
        .set({ outdated: 1 })
        .where(
          and(
            eq(documents.orderId, orderId),
            eq(documents.kind, kind),
            ...(kind === "product_label" ? [eq(documents.itemId, itemId!)] : [])
          )
        )
      await tx.insert(documents).values({
        id,
        orderId,
        kind,
        itemId,
        objectKey,
        name,
        bytes: bytes.length,
        orderRevision: order.revision,
        uploadedBy: s.user.id
      })
    })
    return Response.json({ documents: [{ id, name }] })
  } catch (error) {
    return Response.json(
      { error: await failureMessage(error, "documentUploadFailed") },
      { status: failureStatus(error) }
    )
  }
}
