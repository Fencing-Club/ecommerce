import { packingSchema, validatePacking, type OrderInput } from "@repo/aisle"
import type { documents, shipments, ShipmentState } from "../db/schema"

type Shipment = typeof shipments.$inferSelect
type Document = typeof documents.$inferSelect
// The supplier packet is released from "ready" on; "received" means the goods arrived where the PO sent them.
export const releasedStates: readonly ShipmentState[] = ["ready", "shipped", "forwarded", "received"]
// Once the supplier ships, a shipment's cartons and documents can't change any more.
export const finishedStates: readonly ShipmentState[] = ["shipped", "forwarded", "received", "cancelled"]

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

export function packingReadiness(
  order: OrderInput,
  shipment: Shipment,
  raw: unknown,
  docs: Document[],
  reserved: Record<string, number>,
  orderRevision: number
) {
  const issues: ReadinessIssue[] = []
  if (shipment.orderRevision !== orderRevision) {
    issues.push({
      code: "po_changed",
      message: "The PO changed. Review the latest PO and save the packing draft before submitting"
    })
  }
  if (!["packing", "correction"].includes(shipment.status) || shipment.operation !== "none" || shipment.amazonOrderId) {
    issues.push({ code: "shipment_locked", message: "Resolve the existing shipment before editing its packing list" })
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
  if (
    !docs.some(
      (doc) =>
        doc.id === packing.invoiceDocumentId &&
        doc.orderId === shipment.orderId &&
        doc.shipmentId === shipment.id &&
        doc.kind === "invoice" &&
        !doc.outdated
    )
  ) {
    issues.push({
      code: "missing_invoice",
      field: "invoiceDocumentId",
      message: "Upload the official commercial invoice for this shipment"
    })
  }
  issues.push(...validatePacking(order, packing, reserved).issues.map((issue) => ({ ...issue, code: "packing_rule" })))
  return { packing, issues }
}

// Whether a shipment's packet is complete. Product labels are made from each product when needed, so a line lacks one
// only when its product can't make one yet, as given in missingLabels (see lineLabels).
export function releaseIssues(
  shipment: Shipment,
  docs: Document[],
  missingLabels: ReadonlySet<string> = new Set()
): ReadinessIssue[] {
  if (!shipment.packing || !shipment.snapshot) {
    return [{ code: "missing_packing", message: "Submit the packing list first" }]
  }
  const issues: ReadinessIssue[] = []
  const active = docs.filter((doc) => doc.orderId === shipment.orderId && !doc.outdated)
  const current = active.filter((doc) => doc.shipmentId === shipment.id && doc.shipmentRevision === shipment.revision)
  if (
    shipment.labels.length !== shipment.packing.cartons.length ||
    new Set(shipment.labels.map((label) => label.cartonId)).size !== shipment.labels.length ||
    new Set(shipment.labels.map((label) => label.labelNumber)).size !== shipment.labels.length
  ) {
    issues.push({ code: "unmatched_cartons", message: "Amazon carton labels are not fully matched" })
  }
  for (const kind of ["packing_list", "checklist"]) {
    if (!current.some((doc) => doc.kind === kind)) {
      issues.push({
        code: `missing_${kind}`,
        message: `Generate the current ${kind === "packing_list" ? "packing list" : "checklist"} before releasing labels`
      })
    }
  }
  const checkedItems = new Set<string>()
  for (const carton of shipment.packing.cartons) {
    if (
      !shipment.labels.some((label) => label.cartonId === carton.cartonId) ||
      !current.some((doc) => doc.kind === "carton_label" && doc.cartonId === carton.cartonId)
    ) {
      issues.push({
        code: "missing_carton_label",
        cartonId: carton.cartonId,
        message: `Amazon label is missing for carton ${carton.cartonId}`
      })
    }
    if (!current.some((doc) => doc.kind === "shipping_label" && doc.cartonId === carton.cartonId)) {
      issues.push({
        code: "missing_shipping_label",
        cartonId: carton.cartonId,
        message: `Assign a shipping label to carton ${carton.cartonId}`
      })
    }
    for (const item of carton.items) {
      if (checkedItems.has(item.itemId)) {
        continue
      }
      checkedItems.add(item.itemId)
      if (missingLabels.has(item.itemId)) {
        issues.push({
          code: "missing_product_label",
          itemId: item.itemId,
          message: "Add a product label for this shipped item on the Products page"
        })
      }
    }
  }
  return issues
}
