import { combinePdfs } from "@repo/copacker-shipments/documents"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, type Database, type Transaction } from "@/db"
import { documents, orders, shipments } from "@/db/schema"
import { NotFoundError } from "@/i18n/errors"
import { effectiveAccess } from "@/lib/access"
import { releasedLabelKinds, releasedStates } from "@/lib/shipment-states"
import { accessibleOrder, forwarderOrder } from "./access"
import { requireAccess } from "./authorization"
import { shipmentDocumentFilename } from "./document-filenames"
import { errorTextResponse, requestInput } from "./errors"
import { fileResponse } from "./http-response"
import { readFile } from "./storage"
import type { Session } from "./workspace-session"
import { requireMembership } from "./workspace-session"

type Executor = Database | Transaction

async function labelsReleased(doc: typeof documents.$inferSelect, executor: Executor) {
  if (!releasedLabelKinds.includes(doc.kind)) {
    return true
  }
  if (!doc.shipmentId) {
    return false
  }
  const [shipment] = await executor.select().from(shipments).where(eq(shipments.id, doc.shipmentId))
  return !!shipment && releasedStates.includes(shipment.status) && shipment.revision === doc.shipmentRevision
}

const forwarderKinds = ["invoice", "packing_list", "carton_label", "pallet_label", "shipping_label"]
async function canRead(s: Session, doc: typeof documents.$inferSelect, executor: Executor) {
  if (s.org.kind !== "forwarder") {
    requireAccess(s, ["purchase_order", "product_label"].includes(doc.kind) ? "orders" : "shipments")
    if (["purchase_order", "invoice"].includes(doc.kind)) {
      requireAccess(s, "prices")
    }
    await accessibleOrder(s, doc.orderId, executor)
    return
  }
  requireAccess(s, "orders")
  await forwarderOrder(s, doc.orderId, executor)
  if (!forwarderKinds.includes(doc.kind)) {
    throw new NotFoundError()
  }
}

// Authorization finishes before ownership of the storage stream passes to the response. A withdrawn document or
// membership cancels the unread stream; private bytes never enter an error response or a shared cache.
export async function downloadDocument(
  s: Session,
  rawId: string,
  executor: Executor = db(),
  bundle = false
): Promise<Response> {
  const id = requestInput(z.uuid(), rawId)
  const [doc] = await executor
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.outdated, 0)))
  if (!doc) {
    return errorTextResponse("documentNotFound", 404)
  }
  await canRead(s, doc, executor)
  if (s.org.kind !== "buyer" && !(await labelsReleased(doc, executor))) {
    return errorTextResponse("labelsAwaitingRelease", 409)
  }
  if (bundle && doc.shipmentId && (doc.kind === "carton_label" || doc.kind === "shipping_label")) {
    const selected = await executor
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.shipmentId, doc.shipmentId),
          eq(documents.kind, doc.kind),
          eq(documents.shipmentRevision, doc.shipmentRevision!),
          eq(documents.outdated, 0)
        )
      )
    selected.sort((a, b) => (a.cartonId ?? "").localeCompare(b.cartonId ?? "", undefined, { numeric: true }))
    const files: Uint8Array[] = []
    for (const item of selected) {
      const response = await downloadDocument(s, item.id, executor)
      if (!response.ok) {
        return response
      }
      files.push(new Uint8Array(await response.arrayBuffer()))
    }
    const bytes = await combinePdfs(files)
    const member = await requireMembership(s.user.id, s.org.id, executor)
    const currentSession = { ...s, role: member.role, access: effectiveAccess(s.org.kind, member.access) }
    // Recheck every source after assembling: revocation/replacement must never leak a stale combined packet.
    for (const item of selected) {
      await canRead(currentSession, item, executor)
      const [current] = await executor
        .select()
        .from(documents)
        .where(and(eq(documents.id, item.id), eq(documents.outdated, 0)))
      if (!current || current.objectKey !== item.objectKey) {
        return errorTextResponse("documentChanged", 409)
      }
      if (s.org.kind !== "buyer" && !(await labelsReleased(current, executor))) {
        return errorTextResponse("labelsAwaitingRelease", 409)
      }
    }
    const [shipment] = await executor.select().from(shipments).where(eq(shipments.id, doc.shipmentId))
    if (!shipment || shipment.revision !== doc.shipmentRevision) {
      return errorTextResponse("documentChanged", 409)
    }
    const [order] = await executor.select().from(orders).where(eq(orders.id, doc.orderId))
    if (!order) {
      return errorTextResponse("documentChanged", 409)
    }
    const filename = shipmentDocumentFilename(doc.kind, {
      orderReference: order.data.reference,
      shipmentReference: shipment.amazonShipmentId ?? shipment.id,
      revision: shipment.revision
    })
    return fileResponse(Buffer.from(bytes), { filename, contentType: "application/pdf" })
  }
  const file = await readFile(doc.objectKey)
  let transferred = false
  try {
    await canRead(s, doc, executor)
    const [current] = await executor
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.outdated, 0)))
    if (!current || current.objectKey !== doc.objectKey) {
      return await errorTextResponse("documentChanged", 409)
    }
    if (s.org.kind !== "buyer" && !(await labelsReleased(current, executor))) {
      return await errorTextResponse("labelsAwaitingRelease", 409)
    }
    const member = await requireMembership(s.user.id, s.org.id, executor)
    // A membership can survive while its page/price grants are revoked during a slow storage read.
    await canRead({ ...s, role: member.role, access: effectiveAccess(s.org.kind, member.access) }, current, executor)
    const response = fileResponse(file.body, { filename: doc.name, contentType: "application/pdf" })
    transferred = true
    return response
  } finally {
    if (!transferred) {
      await file.body.cancel()
    }
  }
}
