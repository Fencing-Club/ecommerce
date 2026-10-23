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
      const observable = blockers.length === 0
      let observationStatus = "unavailable"
      if (observable) {
        observationStatus = quantity === row.received ? "quantity_agrees" : "quantity_differs"
      }
      // Neither a shipment name nor the first retained movement establishes the start of receiving.
      blockers.push("receipt_period_unknown")
      return {
        sku: row.sku,
        status: "requires_review",
        observationStatus,
        blockers,
        movementRows: matched.map((movement) => ({
          id: movement.id,
          day: movement.eventDay,
          quantity: movement.quantity
        })),
        received: row.received,
        observedMovementQuantity: observable ? quantity : null,
        observedDifference: observable && row.received !== null ? quantity - row.received : null,
        observedDifferenceMeaning:
          "stored_movement_units_minus_shipment_received_units_not_full_receipt_reconciliation",
        difference: null,
        receiptDate: null,
        lossConfirmed: false
      }
    })
  }
}
