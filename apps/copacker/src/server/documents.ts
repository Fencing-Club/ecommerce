import { randomUUID } from "node:crypto"
import type { Address } from "@repo/aisle"
import { purchaseOrderPdf, packingListPdf, checklistPdf } from "@repo/aisle/documents"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/db"
import {
  contacts,
  documents,
  forwarders,
  orders,
  shipments,
  organizations,
  supplierProfiles,
  suppliers,
  orderRevisions
} from "@/db/schema"
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
// "1 Test Street", "Suite 2", "Testville, WA 98000", "US"
function addressLines(address: Address) {
  return [
    address.addressLine1,
    address.addressLine2,
    [address.city, [address.stateOrRegion, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    address.countryCode
  ].filter(Boolean)
}

// "Wei Chen, wei@supplier.example, +86 512 5555 0100", leaving out what isn't known.
function contactLine(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ")
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
  const { destination, deliveryId, forwarderId } = historical.data
  // A forwarder's address is the buyer's until the forwarder joins, then the forwarder's own.
  const [forwarder] =
    destination === "forwarder" && forwarderId
      ? await db()
          .select()
          .from(forwarders)
          .where(and(eq(forwarders.id, forwarderId), eq(forwarders.buyerOrgId, row.order.buyerOrgId)))
      : []
  const addressOwners = [row.order.buyerOrgId, ...(forwarder?.forwarderOrgId ? [forwarder.forwarderOrgId] : [])]
  const [[delivery], [buyerProfile], [supplierProfile]] = await Promise.all([
    deliveryId && (destination === "warehouse" || forwarder)
      ? db()
          .select({ name: contacts.name, address: contacts.address })
          .from(contacts)
          .where(and(eq(contacts.id, deliveryId), inArray(contacts.orgId, addressOwners)))
      : Promise.resolve([]),
    db().select().from(supplierProfiles).where(eq(supplierProfiles.orgId, row.order.buyerOrgId)),
    row.supplier.supplierOrgId
      ? db().select().from(supplierProfiles).where(eq(supplierProfiles.orgId, row.supplier.supplierOrgId))
      : Promise.resolve([])
  ])
  // A joined supplier keeps its own contact details; until then, the buyer's notes on it.
  const supplierContact = row.supplier.supplierOrgId ? supplierProfile : row.supplier
  const bytes = await purchaseOrderPdf({
    order: historical.data,
    revision: targetRevision,
    issued: historical.createdAt.toISOString().slice(0, 10),
    buyer: {
      name: row.buyer.name,
      lines: [
        ...(buyerProfile?.address ? addressLines(buyerProfile.address) : []),
        contactLine(buyerProfile?.contactName, buyerProfile?.phoneNumber)
      ].filter(Boolean),
      email: buyerProfile?.contactEmail,
      website: buyerProfile?.website
    },
    supplier: {
      name: row.supplier.name,
      lines: [
        row.supplier.shopifySupplierName && row.supplier.shopifySupplierName !== row.supplier.name
          ? row.supplier.shopifySupplierName
          : "",
        contactLine(
          supplierContact?.contactName,
          supplierContact?.contactEmail ?? row.supplier.email,
          supplierContact?.phoneNumber
        )
      ].filter(Boolean)
    },
    shipTo: delivery
      ? {
          name: forwarder ? `${forwarder.name}, ${delivery.name}` : delivery.name,
          lines: [
            ...addressLines(delivery.address),
            contactLine(delivery.address.name, delivery.address.email, delivery.address.phoneNumber)
          ].filter(Boolean)
        }
      : undefined
  })
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
