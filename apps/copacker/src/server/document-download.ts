import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, type Database, type Transaction } from "@/db"
import { documents, shipments } from "@/db/schema"
import { NotFoundError } from "@/i18n/errors"
import { accessibleOrder, forwarderOrder } from "./access"
import { requireAccess } from "./authorization"
import { errorTextResponse } from "./errors"
import { releasedStates } from "./readiness"
import { readFile } from "./storage"
import type { Session } from "./workspace-session"
import { requireMembership } from "./workspace-session"

type Executor = Database | Transaction

async function labelsReleased(doc: typeof documents.$inferSelect, executor: Executor) {
  if (!["shipping_label", "carton_label"].includes(doc.kind)) {
    return true
  }
  if (!doc.shipmentId) {
    return false
  }
  const [shipment] = await executor.select().from(shipments).where(eq(shipments.id, doc.shipmentId))
  return !!shipment && releasedStates.includes(shipment.status) && shipment.revision === doc.shipmentRevision
}

const forwarderKinds = ["invoice", "packing_list", "carton_label", "shipping_label"]
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
export async function downloadDocument(s: Session, rawId: string, executor: Executor = db()) {
  const id = z.uuid().parse(rawId)
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
    await canRead({ ...s, role: member.role, access: member.access }, current, executor)
    const response = new Response(file.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox"
      }
    })
    transferred = true
    return response
  } finally {
    if (!transferred) {
      await file.body.cancel()
    }
  }
}
