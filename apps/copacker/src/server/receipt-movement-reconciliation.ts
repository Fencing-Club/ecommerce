import type { receiptQuantities } from "./receipt-quantities"

type Movement = {
  id: string
  referenceId: string | null
  sku: string | null
  eventType: string
  eventDay: string
  quantity: number
}

// A matching reference and quantity are evidence, not acquisition, lot restoration or loss recognition.
export function reconcileReceiptMovements(
  dataset: string,
  shipmentId: string,
  receipt: ReturnType<typeof receiptQuantities>,
  movements: Movement[],
  truncated: boolean
) {
  if (!receipt) {
    return null
  }
  const referenced = movements.filter((row) => row.referenceId === shipmentId && row.eventType === "Receipts")
  return {
    basis: "stored_fba_receipts_exact_shipment_reference_and_sku",
    searchTruncated: truncated,
    coverage: "stored_movements_only_receipt_period_not_established",
    inventoryAcquisitionConfirmed: false,
    costBasis: "unknown",
    rows: receipt.rows.map((row) => {
      const matched = referenced.filter((movement) => movement.sku === row.sku)
      const blockers: string[] = []
      if (dataset !== "fba_inbound_receipts") {
        blockers.push("awd_to_fba_reference_and_unit_mapping_required")
      }
      if (truncated) {
        blockers.push("movement_search_truncated")
      }
      if (row.status === "duplicate_sku") {
        blockers.push("duplicate_receipt_sku")
      }
      if (row.received === null || row.receivedUnit !== "UNITS") {
        blockers.push("received_units_unavailable")
      }
      if (!matched.length) {
        blockers.push("no_matching_stored_receipt_movements")
      }
      if (referenced.some((movement) => !movement.sku)) {
        blockers.push("referenced_movement_missing_sku")
      }
      const quantity = matched.reduce((sum, movement) => sum + movement.quantity, 0)
      if (!Number.isSafeInteger(quantity) || quantity < 0) {
        blockers.push("invalid_net_receipt_quantity")
      }
      const comparable = blockers.length === 0
      let status = "requires_review"
      if (comparable) {
        status = quantity === row.received ? "quantity_agrees" : "quantity_differs"
      }
      return {
        sku: row.sku,
        status,
        blockers,
        movementRows: matched.map((movement) => ({
          id: movement.id,
          day: movement.eventDay,
          quantity: movement.quantity
        })),
        received: row.received,
        movementQuantity: comparable ? quantity : null,
        difference: comparable && row.received !== null ? quantity - row.received : null,
        differenceMeaning: "stored_movement_units_minus_shipment_received_units",
        receiptDate: null,
        lossConfirmed: false
      }
    })
  }
}
