import { randomUUID } from "node:crypto"
import { purchaseOrderPdf, packingListPdf, checklistPdf } from "@repo/aisle/documents"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { contacts, documents, orders, shipments, organizations, suppliers, orderRevisions } from "@/db/schema"
import { putFile } from "./storage"

type DocumentInput = Omit<typeof documents.$inferInsert, "id" | "objectKey" | "bytes">
export async function storeDocument(input: DocumentInput, bytes: Uint8Array) {
  const id = randomUUID(),
    objectKey = `orders/${input.orderId}/${id}.pdf`
  await putFile(objectKey, bytes)
  return db().transaction(async (tx) => {
    // Serialize replacement with user uploads and preserve previous versions as outdated.
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update")
    if (!order) {
      throw new Error("PO is unavailable")
    }
    let outdated = input.outdated ?? 0
    if (input.shipmentId) {
      const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, input.shipmentId)).for("update")
      if (
        !shipment ||
        shipment.orderId !== input.orderId ||
        shipment.revision !== input.shipmentRevision ||
        shipment.orderRevision !== input.orderRevision ||
        ["packing", "correction", "cancelled"].includes(shipment.status)
      ) {
        throw new Error("Shipment changed while generating documents")
      }
    } else if (input.orderRevision !== order.revision) {
      outdated = 1
    }
    await tx
      .update(documents)
      .set({ outdated: 1 })
      .where(
        and(
          eq(documents.orderId, input.orderId),
          eq(documents.kind, input.kind),
          eq(documents.orderRevision, input.orderRevision),
          input.shipmentId ? eq(documents.shipmentId, input.shipmentId) : isNull(documents.shipmentId),
          input.cartonId ? eq(documents.cartonId, input.cartonId) : isNull(documents.cartonId)
        )
      )
    const [doc] = await tx
      .insert(documents)
      .values({ ...input, outdated, id, objectKey, bytes: bytes.length })
      .returning()
    return doc!
  })
}
export async function generatePo(orderId: string, revision?: number) {
  const [row] = await db()
    .select({ order: orders, buyer: organizations, supplier: suppliers })
    .from(orders)
    .innerJoin(organizations, eq(organizations.id, orders.buyerOrgId))
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(eq(orders.id, orderId))
  if (!row) {
    throw new Error("PO is unavailable")
  }
  const targetRevision = revision ?? row.order.revision
  const [historical] = await db()
    .select()
    .from(orderRevisions)
    .where(and(eq(orderRevisions.orderId, orderId), eq(orderRevisions.revision, targetRevision)))
  if (!historical) {
    throw new Error("PO revision is unavailable")
  }
  const deliveryId = historical.data.destination === "warehouse" ? historical.data.deliveryId : undefined
  const [delivery] = deliveryId
    ? await db()
        .select({ name: contacts.name, address: contacts.address })
        .from(contacts)
        .where(and(eq(contacts.id, deliveryId), eq(contacts.orgId, row.order.buyerOrgId)))
    : []
  const deliveryAddress = delivery
    ? [
        delivery.address.name,
        delivery.address.addressLine1,
        delivery.address.addressLine2,
        delivery.address.city,
        delivery.address.stateOrRegion,
        delivery.address.postalCode,
        delivery.address.countryCode
      ]
        .filter(Boolean)
        .join(", ")
    : undefined
  const bytes = await purchaseOrderPdf(
    historical.data,
    row.buyer.name,
    row.supplier.name,
    targetRevision,
    deliveryAddress
  )
  const doc = await storeDocument(
    {
      orderId,
      kind: "purchase_order",
      name: `${row.order.data.reference}.pdf`,
      orderRevision: targetRevision,
      outdated: targetRevision === row.order.revision ? 0 : 1,
      uploadedBy: "system"
    },
    bytes
  )
  return { doc, bytes }
}
export async function generateShipmentDocuments(shipmentId: string) {
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, shipmentId))
  if (!shipment?.packing || !shipment.snapshot) {
    throw new Error("Shipment packing is missing")
  }
  const input = {
    orderId: shipment.orderId,
    shipmentId,
    orderRevision: shipment.orderRevision,
    shipmentRevision: shipment.revision,
    uploadedBy: "system"
  }
  await storeDocument(
    { ...input, kind: "packing_list", name: "Packing list.pdf" },
    await packingListPdf(shipment.snapshot, shipment.packing, shipment.labels, shipment.amazonShipmentId ?? shipment.id)
  )
  await storeDocument(
    { ...input, kind: "checklist", name: "Packing Checklist.pdf" },
    await checklistPdf(shipment.snapshot, shipment.packing)
  )
}
