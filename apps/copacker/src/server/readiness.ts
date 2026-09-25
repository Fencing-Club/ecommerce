import { packingSchema, validatePacking, type OrderInput } from "@repo/aisle"
import type { documents, shipments } from "../db/schema"

type Shipment = typeof shipments.$inferSelect
type Document = typeof documents.$inferSelect
export type ReadinessIssue = { code: string; message: string; field?: string; cartonId?: string; itemId?: string }

export function reservedPieces(rows: Shipment[], excludeId?: string) {
  const result: Record<string, number> = {}
  for (const row of rows) {
    if (row.id === excludeId || ["packing", "cancelled"].includes(row.status) || !row.packing) {
      continue
    }
    for (const carton of row.packing.cartons) {
      for (const item of carton.items) {
        result[item.itemId] = (result[item.itemId] ?? 0) + item.pieces
      }
    }
  }
  return result
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

export function releaseIssues(shipment: Shipment, docs: Document[]): ReadinessIssue[] {
  if (!shipment.packing || !shipment.snapshot) {
    return [{ code: "missing_packing", message: "Submit the packing list first" }]
  }
  const issues: ReadinessIssue[] = []
  const active = docs.filter((doc) => doc.orderId === shipment.orderId && !doc.outdated)
  const current = active.filter((doc) => doc.shipmentId === shipment.id && doc.shipmentRevision === shipment.revision)
  if (
    shipment.labels.length !== shipment.packing.cartons.length ||
    new Set(shipment.labels.map((label) => label.cartonId)).size !== shipment.labels.length ||
    new Set(shipment.labels.map((label) => label.sscc)).size !== shipment.labels.length
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
      if (!active.some((doc) => doc.kind === "product_label" && doc.itemId === item.itemId)) {
        issues.push({
          code: "missing_product_label",
          itemId: item.itemId,
          message: "Upload a product label for this shipped item"
        })
      }
    }
  }
  return issues
}
