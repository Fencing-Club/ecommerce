import type { Address } from "@repo/copacker-orders"
import { orderDestination } from "@repo/copacker-packing-rules"
import { canEditPacking, canReopenPacking, releasedStates } from "@repo/copacker-shipments/states"
import { shipmentPlaces } from "@/app/(portal)/shipments/destination"
import type { PartnerAddress } from "@/components/partner-address"
import { startingAddress } from "@/components/shipment-packing-details"
import type { documents, orders, shipments } from "@/db/schema"
import { can, type Permissions } from "@/lib/access"
import type { WorkspaceKind } from "@/lib/onboarding"
import { printableLabels } from "@/lib/printable-labels"
import { releasedLabelKinds } from "@/lib/shipment-states"
import { amazonShipmentLinks } from "@/server/amazon-shipments"
import type { ForwarderAddress } from "@/server/forwarders"
import { unpricedDraft, unpricedOrder } from "@/server/prices"
import type { LineLabel } from "@/server/product-barcodes"
import { knownPackingGroups, reservedPieces } from "@/server/readiness"

type Shipment = typeof shipments.$inferSelect

// What a shipment's page is made from, as the database, the workflow and Amazon give it. `shipmentPage` reads these, and
// the page's stories give their own, so both make the page's data the same way.
export type ShipmentPageRows = {
  viewer: { permissions: Permissions; kind: WorkspaceKind }
  shipment: Shipment
  // Every shipment of the purchase order, this one among them.
  shipments: Shipment[]
  order: Pick<typeof orders.$inferSelect, "id" | "revision" | "data">
  // The supplier, and its workspace once it has joined Copacker.
  supplier: { id: string; name: string; supplierOrgId: string | null }
  // The shipment's step as orderWorkflow reports it: what happens next, what its packet lacks, and its packet once the
  // labels are with the supplier.
  step: {
    next: { step: string; message: string }
    issues: Array<{ code: string; message: string }>
    packetUrl: string | null
  }
  // Its place among the purchase order's shipments, oldest first.
  number: number
  // Its documents that are still current.
  docs: Array<
    Pick<
      typeof documents.$inferSelect,
      "id" | "name" | "kind" | "cartonId" | "trackingNumber" | "sourceName" | "sourcePage"
    >
  >
  // The supplier's pickup addresses: its own once it has joined Copacker, and until then the ones the buyer saved for it.
  addresses: PartnerAddress[]
  // The buyer's name, who books AGL in Seller Central.
  buyer: string
  // Whether the supplier's changes to the purchase order are waiting on the buyer.
  awaitingChanges: boolean
  // Each line's SKU and FNSKU labels, as lineLabels reads them: uploaded, made from the standard template, or missing
  // and why.
  labels: Array<{ itemId: string; state: LineLabel["state"]; type?: "sku" | "fnsku"; problem?: string }>
  // The PO's forwarder stop, and where the goods end up, as shipmentPlaceRows reads them.
  forwarder?: Pick<ForwarderAddress, "forwarderName" | "addressName" | "address">
  finalAddresses: Address[]
  // Where the shipment ends up, by name, as shipmentDestinations names it.
  destinationName: string
}

// A shipment's page data from its rows: what the viewer may do, the packing to show or edit, the route, the documents and
// the next step. `title` names the shipment by its number.
export function shipmentPageData(rows: ShipmentPageRows, title: (number: number) => string) {
  const { viewer, shipment, order, supplier, step, docs, addresses, awaitingChanges } = rows
  // Someone who can only view shipments sees each step without its buttons; its purchase order is linked for those who
  // can open it.
  const editsShipments = can(viewer.permissions, "shipments", "edit")
  const seesOrder = can(viewer.permissions, "orders")
  // Someone who doesn't see prices packs and follows the shipment without its invoice's prices.
  const prices = can(viewer.permissions, "prices")
  const id = shipment.id
  const reserved = reservedPieces(rows.shipments, id)
  const snapshot = shipment.snapshot ?? order.data
  const packingOrder = shipment.amazonNetwork
    ? { ...order.data, items: order.data.items.filter((item) => item.receiver === shipment.amazonNetwork) }
    : order.data
  // FBA cartons keep to Amazon's packing groups, which the packing checks know once Amazon has planned a shipment of
  // the PO. Until then they're null, and the supplier is told the groups aren't checked.
  const packingGroups =
    orderDestination(order.data) === "amazon" && packingOrder.items.some((item) => item.receiver === "fba")
      ? (knownPackingGroups(rows.shipments, shipment) ?? null)
      : undefined
  // The address the cartons leave from: the saved one the packing's is, or the packing's as entered.
  const origin = (shipment.packing ?? shipment.packingDraft)?.origin
  const start = startingAddress(addresses, origin)
  // Packing waits while the supplier's changes to the purchase order are with the buyer.
  const editable = editsShipments && canEditPacking(shipment) && !awaitingChanges
  const canReopen = editsShipments && canReopenPacking(shipment)
  const isBuyer = viewer.kind === "buyer"
  // The Amazon shipments are in the buyer's Seller Central, which the supplier can't open, so it reads their IDs.
  const amazonLinks = isBuyer ? amazonShipmentLinks(shipment) : []
  const amazonIds = amazonLinks.length ? [] : (shipment.amazonShipmentId?.split(", ") ?? [])
  const visibleDocs = docs.filter(
    (d) =>
      (isBuyer || releasedStates.includes(shipment.status) || !releasedLabelKinds.includes(d.kind)) &&
      !["invoice", "packing_list", "checklist"].includes(d.kind)
  )
  // The shipment's commercial invoice. There's one at most: each upload replaces the last.
  const changes = (shipment.packing?.changes ?? []).flatMap((change) => {
    const item = snapshot.items.find((i) => i.id === change.itemId)!
    return item.supplierSku === change.supplierSku && item.unitPrice === change.unitPrice ? [] : [{ item, change }]
  })
  const fba = shipment.amazonNetwork === "fba"
  // A supplier that isn't on Copacker sends its details by email, and the buyer enters them here.
  const enteringFor = isBuyer && !supplier.supplierOrgId ? supplier.name : undefined
  const amazon = orderDestination(order.data) === "amazon"
  // What happens next, where nothing below shows it: cancelling in Amazon first.
  const nextStep = isBuyer && step.next.step === "cancellation" ? step.next.message : undefined
  return {
    id,
    // The label types each line being packed prints, and why a barcode label can't be made yet.
    lineLabels: packingOrder.items.map((item) => ({
      itemId: item.id,
      labels: printableLabels(
        item,
        rows.labels
          .filter((row) => row.itemId === item.id)
          .map((row) => ({ ...row, problem: row.state === "missing" ? row.problem : undefined }))
      )
    })),
    route: shipmentPlaces(snapshot, shipment, {
      supplier: supplier.name,
      buyer: rows.buyer,
      pickup: start ? { name: start.name, address: start.address } : origin && { address: origin },
      forwarder: rows.forwarder,
      finalAddresses: rows.finalAddresses
    }),
    // The buyer, who books AGL in Seller Central.
    buyer: rows.buyer,
    destinationName: rows.destinationName,
    editsShipments,
    seesOrder,
    prices,
    editsPartners: can(viewer.permissions, "partners", "edit"),
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
      issues: step.issues.map(({ code, message }) => ({ code, message })),
      packetUrl: step.packetUrl
    },
    // The buyer's carrier label for each carton so far, which the Upload carrier labels dialog opens with.
    carrierLabels: isBuyer
      ? docs.flatMap((doc) =>
          doc.kind === "shipping_label" && doc.cartonId
            ? [
                {
                  cartonId: doc.cartonId,
                  documentId: doc.id,
                  trackingNumber: doc.trackingNumber,
                  sourceName: doc.sourceName,
                  sourcePage: doc.sourcePage
                }
              ]
            : []
        )
      : [],
    reserved,
    packingGroups,
    snapshot: prices ? snapshot : unpricedOrder(snapshot),
    addresses: addresses.map((contact) => ({ id: contact.id, name: contact.name, address: contact.address })),
    awaitingChanges,
    editable,
    canReopenPacking: canReopen,
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
    fba,
    enteringFor,
    amazon,
    title: title(rows.number),
    amazonIds,
    nextStep
  }
}
