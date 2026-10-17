import { notFound } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { shipmentDestinations, shipmentDelivery } from "@/app/(portal)/shipments/destination"
import { db } from "@/db"
import { documents, shipments } from "@/db/schema"
import { can } from "@/lib/access"
import { accessibleOrder } from "@/server/access"
import { amazonShipmentLinks } from "@/server/amazon-shipments"
import { requirePage, session } from "@/server/auth"
import { proposalState } from "@/server/order-proposals"
import { unpricedDraft, unpricedOrder } from "@/server/prices"
import { releasedStates, reservedPieces } from "@/server/readiness"
import { supplierPickupAddresses } from "@/server/supplier-addresses"
import { serverTranslator } from "@/server/translation"
import { orderWorkflow } from "@/server/workflow"
export async function shipmentPage(input: { id: string; query: Record<string, string | string[]> }) {
  const s = await session()
  requirePage(s, "shipments")
  const t = await serverTranslator("shipments.detail")
  // Someone who can only view shipments sees each step without its buttons; its purchase order is linked for those who
  // can open it.
  const editsShipments = can(s, "shipments", "edit")
  const seesOrder = can(s, "orders")
  // Someone who doesn't see prices packs and follows the shipment without its invoice's prices.
  const prices = can(s, "prices")
  // A malformed link is a shipment that doesn't exist.
  const parsed = z.uuid().safeParse(input.id)
  if (!parsed.success) {
    throw notFound()
  }
  const id = parsed.data
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id))
  if (!shipment) {
    throw notFound()
  }
  const { order, supplier } = await accessibleOrder(s, shipment.orderId)
  const workflow = await orderWorkflow(s, order.id)
  const step = workflow.shipments.find((row) => row.id === id)!
  const reserved = reservedPieces(await db().select().from(shipments).where(eq(shipments.orderId, order.id)), id)
  const snapshot = shipment.snapshot ?? order.data
  const packingOrder = shipment.amazonNetwork
    ? { ...order.data, items: order.data.items.filter((item) => item.amazonNetwork === shipment.amazonNetwork) }
    : order.data
  const [docs, addresses] = await Promise.all([
    db()
      .select()
      .from(documents)
      .where(and(eq(documents.shipmentId, id), eq(documents.outdated, 0))),
    // Cartons leave from the supplier's pickup addresses: its own once it has joined Copacker, and until then the ones
    // the buyer saved for it.
    supplierPickupAddresses(supplier)
  ])
  // Packing waits while the supplier's changes to the purchase order are with the buyer.
  const { latest } = await proposalState(order.id)
  const awaitingChanges = latest?.status === "pending"
  const editable =
    editsShipments &&
    ["packing", "correction"].includes(shipment.status) &&
    !shipment.amazonOrderId &&
    shipment.operation === "none" &&
    !awaitingChanges
  const isBuyer = s.org.kind === "buyer"
  // The Amazon shipments are in the buyer's Seller Central, which the supplier can't open, so it reads their IDs.
  const amazonLinks = isBuyer ? amazonShipmentLinks(shipment) : []
  const amazonIds = amazonLinks.length ? [] : (shipment.amazonShipmentId?.split(", ") ?? [])
  const visibleDocs = docs.filter(
    (d) =>
      (isBuyer || releasedStates.includes(shipment.status) || !["shipping_label", "carton_label"].includes(d.kind)) &&
      !["invoice", "packing_list", "checklist"].includes(d.kind)
  )
  // The shipment's commercial invoice. There's one at most: each upload replaces the last.
  const changes = (shipment.packing?.changes ?? []).flatMap((change) => {
    const item = snapshot.items.find((i) => i.id === change.itemId)!
    return item.supplierSku === change.supplierSku && item.unitPrice === change.unitPrice ? [] : [{ item, change }]
  })
  const origin = shipment.packing?.origin
  const fba = shipment.amazonNetwork === "fba"
  // A supplier that isn't on Copacker sends its details by email, and the buyer enters them here.
  const enteringFor = isBuyer && !supplier.supplierOrgId ? supplier.name : undefined
  const amazon = order.data.destination === "amazon"
  // A purchase order's shipments are numbered oldest first, as on the shipments list.
  const title = t("title", { number: workflow.shipments.findIndex((row) => row.id === id) + 1 })
  const cartonCount = shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0
  const destination = await shipmentDestinations([order.data])
  // Where it goes and in how many cartons, then Amazon's shipment IDs. The purchase order leads the title.
  const summary = [
    destination(order.data, shipment.amazonNetwork),
    cartonCount && t("cartonCount", { count: cartonCount }),
    ...amazonIds
  ]
    .filter(Boolean)
    .join(", ")
  // What happens next, where nothing below shows it: the forwarder's leg, or cancelling in Amazon first.
  const nextStep =
    step.next.step === "forward" || (isBuyer && step.next.step === "cancellation") ? step.next.message : undefined
  // The viewer's next step when it's a single click, beside the title.
  return {
    id,
    delivery: await shipmentDelivery(order, shipment),
    destinationName: destination(order.data, shipment.amazonNetwork),
    editsShipments,
    seesOrder,
    prices,
    editsPartners: can(s, "partners", "edit"),
    order: { id: order.id, revision: order.revision, data: prices ? order.data : unpricedOrder(order.data) },
    packingOrder: prices ? packingOrder : unpricedOrder(packingOrder),
    supplier: { id: supplier.id, name: supplier.name },
    shipment: {
      amazonNetwork: shipment.amazonNetwork,
      transport: shipment.transport,
      operation: shipment.operation,
      linkedAmazonShipmentId: shipment.linkedAmazonShipmentId,
      status: shipment.status,
      revision: shipment.revision,
      issue: shipment.issue,
      packing: shipment.packing
        ? {
            ...shipment.packing,
            changes: shipment.packing.changes.map((change) => ({ ...change, unitPrice: prices ? change.unitPrice : 0 }))
          }
        : null,
      packingDraft: prices ? shipment.packingDraft : unpricedDraft(shipment.packingDraft),
      labels: shipment.labels.map((label) => ({ cartonId: label.cartonId, labelNumber: label.labelNumber }))
    },
    step: {
      next: { step: step.next.step, message: step.next.message },
      issues: step.issues.map(({ message }) => ({ message })),
      packetUrl: step.packetUrl,
      canRelease: step.canRelease
    },
    reserved,
    snapshot: prices ? snapshot : unpricedOrder(snapshot),
    addresses: addresses.map((contact) => ({ id: contact.id, name: contact.name, address: contact.address })),
    awaitingChanges,
    editable,
    isBuyer,
    amazonLinks,
    visibleDocs: visibleDocs.map((doc) => ({ id: doc.id, name: doc.name, kind: doc.kind, cartonId: doc.cartonId })),
    changes: changes
      .filter(({ item, change }) => prices || change.supplierSku !== item.supplierSku)
      .map(({ item, change }) => ({
        item: {
          name: item.name,
          variant: item.variant,
          supplierSku: item.supplierSku,
          unitPrice: prices ? item.unitPrice : 0
        },
        change: { itemId: change.itemId, supplierSku: change.supplierSku, unitPrice: prices ? change.unitPrice : 0 }
      })),
    origin,
    fba,
    enteringFor,
    amazon,
    title,
    summary,
    nextStep
  }
}
