import { validatePacking } from "@repo/copacker-packing-rules"
import type { OrderInput } from "@repo/copacker-shipments"
import type { Packing } from "@repo/copacker-shipments"
import { packingSchema, orderDestination } from "@repo/copacker-shipments"
import { shipmentLabelRequirements } from "@repo/copacker-shipments/transport"
import type { ServerText } from "@/i18n/server-text"
import { serverTextInEnglish } from "@/i18n/server-text"
import { issueValues } from "@/lib/packing-messages"
import type { ShipmentState } from "../db/schema"
import type { documents, shipments } from "../db/schema"

type Shipment = typeof shipments.$inferSelect
type Document = typeof documents.$inferSelect
// The supplier packet is released from "ready" on; "received" means the goods arrived where the PO sent them.
export const releasedStates: readonly ShipmentState[] = ["ready", "shipped", "forwarded", "received"]
// From "packed" on, the shipment's packing is finished, so its packing list prints; a correction reopens it.
export const packedStates: readonly ShipmentState[] = [
  "packed",
  "approval",
  "queued",
  "creating",
  "waiting_labels",
  "ready",
  "shipped",
  "forwarded",
  "received",
  "needs_attention"
]
// Once the supplier ships, a shipment's cartons and documents can't change any more.
export const finishedStates: readonly ShipmentState[] = ["shipped", "forwarded", "received", "cancelled"]
// Amazon's and the carrier's labels reach the supplier and forwarder only once the buyer releases the shipment.
export const releasedLabelKinds: ReadonlyArray<Document["kind"]> = ["carton_label", "pallet_label", "shipping_label"]

// Pieces per PO item in shipments that arrived.
export function receivedPieces(rows: Shipment[]) {
  const result: Record<string, number> = {}
  for (const item of reservations(rows)) {
    if (item.status === "received") {
      result[item.itemId] = (result[item.itemId] ?? 0) + item.pieces
    }
  }
  return result
}

export type ReadinessIssue = { code: string; message: string; field?: string; cartonId?: string; itemId?: string }

// The earliest date that is still today somewhere on Earth: the date at UTC−12. The packing form asks for a ready date
// of the supplier's own today or later, which is never before this, whatever the supplier's time zone.
function earliestToday(now: Date | number) {
  return new Date(new Date(now).getTime() - 12 * 3600000).toISOString().slice(0, 10)
}

function* reservations(rows: Shipment[], excludeId?: string) {
  for (const row of rows) {
    if (row.id === excludeId || ["packing", "cancelled"].includes(row.status) || !row.packing) {
      continue
    }
    for (const carton of row.packing.cartons) {
      for (const item of carton.items) {
        yield { itemId: item.itemId, pieces: item.pieces, status: row.status }
      }
    }
  }
}

export function reservedPieces(rows: Shipment[], excludeId?: string) {
  const result: Record<string, number> = {}
  for (const item of reservations(rows, excludeId)) {
    result[item.itemId] = (result[item.itemId] ?? 0) + item.pieces
  }
  return result
}

export function orderCoverage(order: OrderInput, rows: Shipment[]) {
  const quantities = new Map<string, { total: number; byStatus: Partial<Record<ShipmentState, number>> }>()
  for (const item of reservations(rows)) {
    const quantity = quantities.get(item.itemId) ?? { total: 0, byStatus: {} }
    quantity.total += item.pieces
    quantity.byStatus[item.status] = (quantity.byStatus[item.status] ?? 0) + item.pieces
    quantities.set(item.itemId, quantity)
  }
  return order.items.map((item) => {
    const assigned = quantities.get(item.id)
    const assignedPieces = assigned?.total ?? 0
    return {
      itemId: item.id,
      name: item.name,
      variant: item.variant,
      buyerSku: item.buyerSku,
      orderedPieces: item.pieces,
      assignedPieces,
      assignedByStatus: assigned?.byStatus ?? {},
      remainingPieces: Math.max(0, item.pieces - assignedPieces),
      overAssignedPieces: Math.max(0, assignedPieces - item.pieces)
    }
  })
}

// Amazon's packing groups for a shipment's FBA cartons, by SKU: the ones Amazon set when it planned this shipment or,
// until it has, the latest it set for another of the purchase order's shipments, since Amazon groups the same products
// the same way. Undefined until Amazon has planned one, when the packing checks can't check the groups.
export function knownPackingGroups(rows: Shipment[], shipment: Shipment) {
  const [latest] = rows
    .filter((row) => row.orderId === shipment.orderId && row.packingGroups)
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return shipment.packingGroups ?? latest?.packingGroups ?? undefined
}

// Whether a shipment's packing is ready to submit, given the purchase order's shipments (rows): what the others hold and
// Amazon's packing groups (see knownPackingGroups).
export function packingReadiness(
  order: OrderInput,
  shipment: Shipment,
  raw: unknown,
  rows: Shipment[],
  orderRevision: number,
  t: ServerText = serverTextInEnglish,
  now: Date | number = Date.now()
) {
  const issues: ReadinessIssue[] = []
  if (shipment.orderRevision !== orderRevision) {
    issues.push({
      code: "po_changed",
      message: t("readiness.orderChanged")
    })
  }
  if (
    !["packing", "correction", "packed"].includes(shipment.status) ||
    shipment.operation !== "none" ||
    shipment.amazonOrderId
  ) {
    issues.push({ code: "shipment_locked", message: t("readiness.shipmentLocked") })
  }
  const parsed = packingSchema.safeParse(raw)
  if (!parsed.success) {
    issues.push(
      ...parsed.error.issues.map((issue) => ({
        code: "incomplete_field",
        field: issue.path.join("."),
        message: issue.message
      }))
    )
    return { packing: null, issues }
  }
  const packing = parsed.data
  // Finishing packing needs a ready date that hasn't passed. Once packed, the date stays as the supplier gave it: the
  // FBA booking starts its ready-to-ship window no sooner than now.
  if (["packing", "correction"].includes(shipment.status) && packing.readyDate < earliestToday(now)) {
    issues.push({ code: "ready_date_passed", field: "readyDate", message: t("readiness.readyDatePassed") })
  }
  if (
    shipment.amazonNetwork &&
    packing.cartons.some((carton) =>
      carton.items.some(
        (content) => order.items.find((item) => item.id === content.itemId)?.receiver !== shipment.amazonNetwork
      )
    )
  ) {
    issues.push({ code: "network_mismatch", message: t("readiness.networkMismatch") })
  }
  issues.push(
    ...validatePacking(
      order,
      { ...packing, packingGroups: knownPackingGroups(rows, shipment) },
      reservedPieces(rows, shipment.id)
    ).issues.map((issue) => ({
      code: "packing_rule",
      cartonId: issue.cartonId,
      message: t(`readiness.packing.${issue.code}`, issueValues(issue, order.items))
    }))
  )
  return { packing, issues }
}

// Whether a shipment's packet is complete, with each issue in t's language. A shipment to Amazon also needs what
// amazonIssues checks; one anywhere else has no carton or shipping labels, and its packing list and checklist are made
// from its packing when the packet is downloaded. Product labels are made from each product when needed, so a line
// lacks one only when its product can't make one yet, as given in missingLabels (see lineLabels).
export function releaseIssues(
  shipment: Shipment,
  docs: Document[],
  missingLabels: ReadonlySet<string> = new Set(),
  t: ServerText = serverTextInEnglish
): ReadinessIssue[] {
  if (!shipment.packing || !shipment.snapshot) {
    return [{ code: "missing_packing", message: t("readiness.missingPacking") }]
  }
  const issues =
    orderDestination(shipment.snapshot) === "amazon" ? amazonIssues(shipment, shipment.packing, docs, t) : []
  if (shipmentLabelRequirements(orderDestination(shipment.snapshot), shipment.transport).needsTransport) {
    issues.push({ code: "missing_transport", message: t("readiness.missingTransport") })
  }
  const shipped = new Set(shipment.packing.cartons.flatMap((carton) => carton.items.map((item) => item.itemId)))
  for (const item of shipment.snapshot.items) {
    if (shipped.has(item.id) && missingLabels.has(item.id)) {
      issues.push({
        code: "missing_product_label",
        itemId: item.id,
        message: t("readiness.missingProductLabel", { sku: item.buyerSku })
      })
    }
  }
  return issues
}

// Amazon carton labels and packing documents must match the current revision. The configured transport decides
// whether each carton also needs a carrier label.
function amazonIssues(shipment: Shipment, packing: Packing, docs: Document[], t: ServerText) {
  const issues: ReadinessIssue[] = []
  const current = docs.filter(
    (doc) =>
      doc.orderId === shipment.orderId &&
      !doc.outdated &&
      doc.shipmentId === shipment.id &&
      doc.shipmentRevision === shipment.revision
  )
  if (
    shipment.labels.length !== packing.cartons.length ||
    new Set(shipment.labels.map((label) => label.cartonId)).size !== shipment.labels.length ||
    new Set(shipment.labels.map((label) => label.labelNumber)).size !== shipment.labels.length
  ) {
    issues.push({ code: "unmatched_cartons", message: t("readiness.unmatchedCartons") })
  }
  for (const carton of packing.cartons) {
    if (
      !shipment.labels.some((label) => label.cartonId === carton.cartonId) ||
      !current.some((doc) => doc.kind === "carton_label" && doc.cartonId === carton.cartonId)
    ) {
      issues.push({
        code: "missing_carton_label",
        cartonId: carton.cartonId,
        message: t("readiness.missingCartonLabel", { carton: carton.cartonId })
      })
    }
    // The supplier packet lists each carrier label's tracking number for its carton.
    const carrierLabel = current.find((doc) => doc.kind === "shipping_label" && doc.cartonId === carton.cartonId)
    if (shipmentLabelRequirements(orderDestination(shipment.snapshot!), shipment.transport).carrierLabels) {
      if (!carrierLabel) {
        issues.push({
          code: "missing_shipping_label",
          cartonId: carton.cartonId,
          message: t("readiness.missingShippingLabel", { carton: carton.cartonId })
        })
      } else if (!carrierLabel.trackingNumber) {
        issues.push({
          code: "missing_tracking_number",
          cartonId: carton.cartonId,
          message: t("readiness.missingTrackingNumber", { carton: carton.cartonId })
        })
      }
    }
  }
  // Amazon labels an FBA shipment's pallets with its cartons, four labels for each pallet.
  if (shipment.amazonNetwork === "fba" && packing.palletized && !current.some((doc) => doc.kind === "pallet_label")) {
    issues.push({ code: "missing_pallet_label", message: t("readiness.missingPalletLabels") })
  }
  return issues
}
