import { expect, it } from "vitest"
import { importedProductMatch } from "../src/server/analytics-product-evidence"
import { receiptQuantities } from "../src/server/receipt-quantities"
const catalog = [
  {
    shopifyDomain: "store",
    status: "idle" as const,
    snapshot: { observedAt: "2026-10-01T00:00:00Z", rows: [{ variantId: "v1", buyerSku: "SKU" }] }
  }
]
it("compares only like units without fabricating costs, receipt dates or claim eligibility", () => {
  const result = receiptQuantities(
    "awd_inbound_receipts",
    {
      shipmentSkuQuantities: [
        {
          sku: "SKU",
          expectedQuantity: { quantity: 5, unitOfMeasurement: "CASES" },
          receivedQuantity: { quantity: 3, unitOfMeasurement: "CASES" }
        },
        {
          sku: "other",
          expectedQuantity: { quantity: 2, unitOfMeasurement: "CASES" },
          receivedQuantity: { quantity: 20, unitOfMeasurement: "UNITS" }
        },
        { sku: "missing", expectedQuantity: { quantity: 3, unitOfMeasurement: "CASES" } }
      ]
    },
    catalog
  )
  expect(result).toMatchObject({
    costBasis: "unknown",
    receiptDate: null,
    inventoryAcquisitionConfirmed: false,
    claimEligibility: "not_assessed"
  })
  expect(result?.rows[0]).toMatchObject({
    status: "shortfall",
    difference: 2,
    physicalPieces: null,
    product: { status: "current_sku_candidate", historicalMappingConfirmed: false }
  })
  expect(result?.rows[1]).toMatchObject({ status: "unit_mismatch", difference: null })
  expect(result?.rows[2]).toMatchObject({ status: "received_unknown", difference: null })
})
it("preserves valid zero, overages and ambiguous quantities", () => {
  const result = receiptQuantities(
    "fba_inbound_receipts",
    {
      items: [
        { sku: "zero", sent: 0, received: 0, unit: "UNITS" },
        { sku: "extra", sent: 2, received: 3, unit: "UNITS" },
        { sku: "dup", sent: 2, received: 1, unit: "UNITS" },
        { sku: "dup", sent: 2, received: 1, unit: "UNITS" },
        { sku: "unknown", sent: null, received: 1, unit: "UNITS" }
      ]
    },
    []
  )
  expect(result?.rows.map((r) => [r.status, r.difference])).toEqual([
    ["balanced", 0],
    ["overage", -1],
    ["duplicate_sku", null],
    ["duplicate_sku", null],
    ["expected_unknown", null]
  ])
  expect(receiptQuantities("awd_inbound_receipts", {}, [])?.status).toBe("missing_or_invalid_items")
})
it("never promotes current SKU observations to dated mappings and reports ambiguous products", () => {
  expect(importedProductMatch("sku", catalog).status).toBe("unmatched")
  expect(importedProductMatch(null, catalog).status).toBe("missing_sku")
  expect(importedProductMatch("SKU", [...catalog, { ...catalog[0]!, shopifyDomain: "another" }])).toMatchObject({
    status: "ambiguous",
    candidateCount: 2,
    costBasis: "unknown"
  })
})

it.each([
  ["CANCELLED", "inactive"],
  ["CREATED", "not_final"],
  ["CLOSED", "closed_quantity_review"]
])("keeps %s shipment lifecycle separate from a raw quantity difference", (shipmentStatus, reviewState) => {
  expect(
    receiptQuantities(
      "awd_inbound_receipts",
      {
        shipmentStatus,
        shipmentSkuQuantities: [
          {
            sku: "SKU",
            expectedQuantity: { quantity: 6, unitOfMeasurement: "CASES" },
            receivedQuantity: { quantity: 0, unitOfMeasurement: "CASES" }
          }
        ]
      },
      []
    )
  ).toMatchObject({ reviewState, claimEligibility: "not_assessed", rows: [{ difference: 6 }] })
})
