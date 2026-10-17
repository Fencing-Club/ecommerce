import { createHash } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { shipmentDelivery } from "@/app/(portal)/shipments/destination"
import { db } from "@/db"
import { documents, organizations, shipments } from "@/db/schema"
import { shippingDocumentSnapshot } from "@/documents/shipping-snapshot"
import { NotFoundError } from "@/i18n/errors"
import { accessibleOrder } from "./access"
import { requireAccess } from "./authorization"
import { StatusError, errorText } from "./errors"
import { lineLabels } from "./product-barcodes"
import { releasedStates, releaseIssues } from "./readiness"
import { requireMembership, type Session } from "./workspace-session"

// Read a released revision, never the live PO's editable values. No price or storage credential leaves this module.
export async function releasedPacket(s: Session, rawId: string, expected?: string) {
  requireAccess(s, "shipments")
  const id = z.uuid().parse(rawId)
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id))
  if (!shipment) {
    throw new NotFoundError()
  }
  const { order, supplier } = await accessibleOrder(s, shipment.orderId)
  if (!releasedStates.includes(shipment.status)) {
    throw new StatusError(expected ? "packetChanged" : "packetNotReleased", 409)
  }
  const docs = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.orderId, order.id), eq(documents.outdated, 0)))
  const labelOrder = { ...order, data: shipment.snapshot ?? order.data }
  const labels = await lineLabels(labelOrder)
  const missing = new Set(labels.filter((label) => label.state === "missing").map((label) => label.itemId))
  if (releaseIssues(shipment, docs, missing).length) {
    throw new StatusError("packetIncomplete", 409)
  }
  const version = createHash("sha256")
    .update(
      JSON.stringify({
        revision: shipment.revision,
        snapshot: shipment.snapshot,
        packing: shipment.packing,
        transport: shipment.transport,
        labels: shipment.labels,
        productLabels: labels,
        documents: docs
          .filter((doc) => doc.shipmentId === id)
          .map((doc) => [doc.id, doc.objectKey])
          .sort()
      })
    )
    .digest("hex")
  if (expected && expected !== version) {
    throw new StatusError("packetChanged", 409)
  }
  const member = await requireMembership(s.user.id, s.org.id)
  requireAccess({ ...s, role: member.role, access: member.access }, "shipments")
  return { shipment, order, supplier, docs, labelOrder, labels, version }
}

export async function shipmentPacketPage(s: Session, id: string) {
  const { shipment, order, supplier, version, labels } = await releasedPacket(s, id)
  if (!shipment.packing || !shipment.snapshot || !shipment.transport) {
    throw new StatusError("packetIncomplete", 409)
  }
  const [buyer] = await db()
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, order.buyerOrgId))
  if (!buyer) {
    throw new NotFoundError()
  }
  const delivery = await shipmentDelivery(order, shipment)
  const destination = delivery.addresses[0]
  // One document names one physical destination. Never invent a warehouse address or silently select one of several.
  if (!destination || delivery.addresses.length !== 1) {
    throw new StatusError("packetDestinationUnavailable", 409)
  }
  let data: ReturnType<typeof shippingDocumentSnapshot>
  try {
    data = shippingDocumentSnapshot({
      order: shipment.snapshot,
      packing: shipment.packing,
      labels: shipment.labels,
      transport: shipment.transport,
      company: buyer.name,
      supplier: supplier.name,
      revision: shipment.revision,
      shipmentId: shipment.amazonShipmentId ?? shipment.id,
      generatedDate: new Date().toISOString().slice(0, 10),
      destination: {
        name: destination.name,
        address: [
          destination.addressLine1,
          destination.addressLine2,
          [destination.city, destination.stateOrRegion, destination.postalCode].filter(Boolean).join(", "),
          destination.countryCode
        ].filter(Boolean)
      }
    })
  } catch {
    throw new StatusError("packetIncomplete", 409)
  }
  await releasedPacket(s, id, version)
  const included = new Set(shipment.packing.cartons.flatMap((carton) => carton.items.map((item) => item.itemId)))
  return {
    id,
    orderId: order.id,
    version,
    data,
    hasProductLabels:
      labels.some(
        (label) => included.has(label.itemId) && (label.state === "standard" || label.state === "uploaded")
      ) ||
      shipment.snapshot.items.some(
        (item) =>
          included.has(item.id) &&
          (item.packingRequirements ? item.packingRequirements.labels.includes("suffocation") : item.suffocationWarning)
      )
  }
}

export async function shipmentPacketResult(s: Session, id: string) {
  try {
    return await shipmentPacketPage(s, id)
  } catch (error) {
    if (!(error instanceof StatusError)) {
      throw error
    }
    return { unavailable: true as const, id, message: (await errorText())(error.key, error.values) }
  }
}
