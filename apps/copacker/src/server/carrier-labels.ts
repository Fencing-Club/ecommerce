import { randomUUID } from "node:crypto"
import { splitPdfPages } from "@repo/copacker-shipments/labels"
import { shipmentLabelRequirements } from "@repo/copacker-shipments/transport"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { documents, shipments } from "@/db/schema"
import { LocalizedError, NotFoundError } from "@/i18n/errors"
import { trackingNumberSchema } from "@/lib/tracking-numbers"
import { accessibleOrder } from "./access"
import { requireAccess, requireBuyer } from "./authorization"
import { queueLabels, sendQueuedLabels, type QueuedLabels } from "./label-release"
import { deleteFile, putFile, validatePdf } from "./storage"
import type { Session } from "./workspace-session"

const cartonId = z.string().min(1).max(100)
// Each carton's carrier label as the dialog leaves it: a page of one of the files sent with it, or the label the carton
// already has. A carton left out has none.
const labelsSchema = z
  .array(
    z.union([
      z.object({
        cartonId,
        file: z.number().int().min(0).max(99),
        page: z.number().int().positive(),
        trackingNumber: trackingNumberSchema
      }),
      z.object({ cartonId, documentId: z.uuid(), trackingNumber: trackingNumberSchema })
    ])
  )
  .max(1000)

// The documents route takes one PDF of up to 32 MB; one save takes several, up to 64 MB in all.
const maxFileBytes = 32 * 1024 * 1024
export const maxCarrierLabelBytes = 64 * 1024 * 1024

// Saves a shipment's carrier labels: each a page of a PDF from the buyer's carrier, kept with its tracking number for
// the supplier packet. Cartons may be left for later. Once every carton has one, the labels go to the supplier.
export async function saveCarrierLabels(s: Session, shipmentId: string, form: FormData) {
  requireBuyer(s)
  requireAccess(s, "shipments", "edit")
  const revision = z.coerce.number().int().parse(form.get("revision"))
  const labels = labelsSchema.parse(JSON.parse(z.string().parse(form.get("labels"))))
  const files = form.getAll("file")
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, shipmentId))
  if (!shipment) {
    throw new NotFoundError()
  }
  const { order } = await accessibleOrder(s, shipment.orderId)
  if (shipment.status !== "waiting_labels" || shipment.revision !== revision) {
    throw new LocalizedError("shipmentNotWaitingForLabels")
  }
  if (
    !shipment.packing ||
    !shipmentLabelRequirements((shipment.snapshot ?? order.data).destination, shipment.transport).carrierLabels
  ) {
    throw new LocalizedError("shipmentNotWaitingForLabels")
  }
  const cartons = new Set(shipment.packing.cartons.map((carton) => carton.cartonId))
  // A carton has one label, and a label one carton: the same page, or the same tracking number, twice would put one
  // label on two cartons.
  const pagesUsed = labels.flatMap((label) => ("file" in label ? [`${label.file}:${label.page}`] : []))
  if (
    new Set(labels.map((label) => label.cartonId)).size !== labels.length ||
    new Set(pagesUsed).size !== pagesUsed.length ||
    new Set(labels.map((label) => label.trackingNumber)).size !== labels.length
  ) {
    throw new LocalizedError("labelAssignedOnce")
  }
  if (labels.some((label) => !cartons.has(label.cartonId))) {
    throw new LocalizedError("labelAssignmentUnknown")
  }
  // Each file's pages, read once however many cartons it labels.
  const pages = new Map<number, Awaited<ReturnType<typeof splitPdfPages>>>()
  const staged: Array<typeof documents.$inferInsert> = []
  let queued: QueuedLabels
  try {
    for (const label of labels) {
      if (!("file" in label)) {
        continue
      }
      const file = files[label.file]
      if (!(file instanceof File) || file.size > maxFileBytes) {
        throw new LocalizedError("choosePdfUnder32")
      }
      if (!pages.has(label.file)) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        await validatePdf(bytes)
        pages.set(label.file, await splitPdfPages(bytes))
      }
      const filePages = pages.get(label.file)!
      const page = filePages.find((entry) => entry.page === label.page)
      if (!page) {
        throw new LocalizedError("labelAssignmentUnknown")
      }
      const id = randomUUID(),
        objectKey = `orders/${shipment.orderId}/${id}.pdf`
      await putFile(objectKey, page.data)
      staged.push({
        id,
        orderId: shipment.orderId,
        shipmentId,
        kind: "shipping_label",
        cartonId: label.cartonId,
        trackingNumber: label.trackingNumber,
        sourceName: file.name.slice(0, 180),
        // A file of one label, as some carriers give them, has no page to name.
        sourcePage: filePages.length > 1 ? label.page : null,
        objectKey,
        name: `Carrier label - ${label.cartonId}.pdf`,
        bytes: page.data.length,
        orderRevision: shipment.orderRevision,
        shipmentRevision: shipment.revision,
        uploadedBy: s.user.id
      })
    }
    queued = await db().transaction(async (tx) => {
      await accessibleOrder(s, shipment.orderId, tx, true)
      const [fresh] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
      if (fresh?.status !== "waiting_labels" || fresh.revision !== shipment.revision) {
        throw new LocalizedError("shipmentChangedDuringUpload")
      }
      const current = await tx
        .select()
        .from(documents)
        .where(
          and(eq(documents.shipmentId, shipmentId), eq(documents.kind, "shipping_label"), eq(documents.outdated, 0))
        )
      for (const document of current) {
        const label = labels.find((entry) => entry.cartonId === document.cartonId)
        if (label && "documentId" in label && label.documentId === document.id) {
          await tx.update(documents).set({ trackingNumber: label.trackingNumber }).where(eq(documents.id, document.id))
        } else {
          // Replaced by a new page, or removed.
          await tx.update(documents).set({ outdated: 1 }).where(eq(documents.id, document.id))
        }
      }
      // A label kept from before must still be that carton's.
      if (
        labels.some(
          (label) =>
            "documentId" in label &&
            !current.some((document) => document.id === label.documentId && document.cartonId === label.cartonId)
        )
      ) {
        throw new LocalizedError("shipmentChangedDuringUpload")
      }
      if (staged.length) {
        await tx.insert(documents).values(staged)
      }
      return queueLabels(tx, { shipmentId, actor: s.user.id })
    })
  } catch (error) {
    await Promise.allSettled(staged.map((document) => deleteFile(document.objectKey)))
    throw error
  }
  return { sent: await sendQueuedLabels(queued) }
}
