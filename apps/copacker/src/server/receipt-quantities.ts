import { z } from "zod"
import { importedProductMatch, type importedProductCatalog } from "./analytics-product-evidence"

const quantity = z.number().int().nonnegative().safe()
const fba = z.object({
  items: z.array(
    z.object({ sku: z.string().min(1), sent: quantity.nullable(), received: quantity.nullable(), unit: z.string() })
  )
})
const measure = z.object({ quantity, unitOfMeasurement: z.string() })
const awd = z.object({
  shipmentSkuQuantities: z.array(
    z.object({ sku: z.string().min(1), expectedQuantity: measure, receivedQuantity: measure.optional() })
  )
})
export function receiptQuantities(
  dataset: string,
  data: unknown,
  catalogs: Awaited<ReturnType<typeof importedProductCatalog>>
) {
  if (dataset !== "fba_inbound_receipts" && dataset !== "awd_inbound_receipts") {
    return null
  }
  const f = dataset === "fba_inbound_receipts" ? fba.safeParse(data).data : undefined
  const a = dataset === "awd_inbound_receipts" ? awd.safeParse(data).data : undefined
  const rows =
    f?.items.map((r) => ({
      sku: r.sku,
      expected: r.sent,
      received: r.received,
      expectedUnit: r.unit,
      receivedUnit: r.unit
    })) ??
    a?.shipmentSkuQuantities.map((r) => ({
      sku: r.sku,
      expected: r.expectedQuantity.quantity,
      expectedUnit: r.expectedQuantity.unitOfMeasurement,
      received: r.receivedQuantity?.quantity ?? null,
      receivedUnit: r.receivedQuantity?.unitOfMeasurement ?? null
    }))
  const counts = new Map<string, number>()
  for (const r of rows ?? []) {
    counts.set(r.sku, (counts.get(r.sku) ?? 0) + 1)
  }
  const shipment = z
    .object({ status: z.string().optional(), shipmentStatus: z.string().optional() })
    .safeParse(data).data
  const shipmentStatus = shipment?.shipmentStatus ?? shipment?.status ?? null
  let reviewState = "not_final"
  if (["CANCELLED", "CANCELED", "DELETED"].includes(shipmentStatus ?? "")) {
    reviewState = "inactive"
  } else if (shipmentStatus === "CLOSED") {
    reviewState = "closed_quantity_review"
  } else if (!shipmentStatus) {
    reviewState = "status_unknown"
  }
  const validRows =
    rows?.length &&
    rows.every(
      (r) =>
        counts.get(r.sku) === 1 &&
        r.expected !== null &&
        r.received !== null &&
        r.expectedUnit === r.receivedUnit &&
        ["UNITS", "CASES"].includes(r.expectedUnit)
    )
  let receiptOutcome = "quantities_unknown"
  if (reviewState === "inactive") {
    receiptOutcome = "inactive_plan"
  } else if (reviewState === "not_final") {
    receiptOutcome = "receiving_not_final"
  } else if (reviewState === "closed_quantity_review" && validRows) {
    if (rows.every((r) => r.received === 0)) {
      receiptOutcome = "closed_no_receipt_reported"
    } else if (rows.every((r) => r.expected === r.received)) {
      receiptOutcome = "closed_reported_counts_agree"
    } else {
      receiptOutcome = "closed_reported_counts_differ"
    }
  }
  return {
    status: rows?.length ? "quantity_evidence" : "missing_or_invalid_items",
    shipmentStatus,
    reviewState,
    receiptOutcome,
    unusedPlanConfirmed: null,
    transferToFbaConfirmed: false,
    unitConversion: {
      status: "not_established",
      reason: "dated_product_and_pack_evidence_required"
    },
    costBasis: "unknown",
    receiptDate: null,
    inventoryAcquisitionConfirmed: false,
    claimEligibility: "not_assessed",
    rows: (rows ?? []).map((r) => {
      let status = "balanced"
      if ((counts.get(r.sku) ?? 0) > 1) {
        status = "duplicate_sku"
      } else if (r.received === null) {
        status = "received_unknown"
      } else if (r.expected === null) {
        status = "expected_unknown"
      } else if (r.expectedUnit !== r.receivedUnit) {
        status = "unit_mismatch"
      } else if (!["UNITS", "CASES"].includes(r.expectedUnit)) {
        status = "unsupported_unit"
      } else if (r.expected > r.received) {
        status = "shortfall"
      } else if (r.expected < r.received) {
        status = "overage"
      }
      return {
        ...r,
        status,
        difference:
          ["balanced", "shortfall", "overage"].includes(status) && r.expected !== null && r.received !== null
            ? r.expected - r.received
            : null,
        physicalPieces: null,
        product: importedProductMatch(r.sku, catalogs)
      }
    })
  }
}
