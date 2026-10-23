import { expect, it } from "vitest"
import { reconcileReceiptMovements } from "../src/server/receipt-movement-reconciliation"
import { receiptQuantities } from "../src/server/receipt-quantities"
const receipt = receiptQuantities(
  "fba_inbound_receipts",
  { status: "CLOSED", items: [{ sku: "SKU", sent: 10, received: 8, unit: "UNITS" }] },
  []
)
const movement = {
  id: "m1",
  referenceId: "SHIP",
  sku: "SKU",
  eventDay: "2026-09-01",
  eventType: "Receipts",
  quantity: 8
}
it("compares explicit shipment/SKU receipt movements without treating agreement as a lot receipt", () => {
  const result = reconcileReceiptMovements(
    "fba_inbound_receipts",
    "SHIP",
    receipt,
    [movement, { ...movement, id: "other", referenceId: "OTHER", quantity: 90 }],
    false
  )
  expect(result?.rows[0]).toMatchObject({
    status: "requires_review",
    observationStatus: "quantity_agrees",
    observedMovementQuantity: 8,
    observedDifference: 0,
    difference: null,
    receiptDate: null,
    lossConfirmed: false
  })
  expect(result?.inventoryAcquisitionConfirmed).toBe(false)
  const different = reconcileReceiptMovements(
    "fba_inbound_receipts",
    "SHIP",
    receipt,
    [{ ...movement, quantity: 7 }],
    false
  )
  expect(different?.rows[0]).toMatchObject({
    status: "requires_review",
    observationStatus: "quantity_differs",
    observedDifference: -1,
    difference: null
  })
  expect(different?.rows[0]?.blockers).toContain("receipt_period_unknown")
})
it("withholds totals for incomplete searches, absent references and AWD units", () => {
  for (const [dataset, rows, truncated] of [
    ["fba_inbound_receipts", [movement], true],
    ["fba_inbound_receipts", [], false],
    ["awd_inbound_receipts", [movement], false],
    ["fba_inbound_receipts", [movement, { ...movement, id: "unknown", sku: null }], false]
  ] as const) {
    expect(
      reconcileReceiptMovements(dataset, "SHIP", receipt, [...rows], truncated)?.rows[0]?.observedMovementQuantity
    ).toBeNull()
  }
})
it("keeps late positive adjustments and negative receipt corrections from becoming confirmed discrepancies", () => {
  for (const quantity of [1, -1]) {
    const result = reconcileReceiptMovements(
      "fba_inbound_receipts",
      "SHIP",
      receipt,
      [{ ...movement, quantity }],
      false
    )
    expect(result?.rows[0]).toMatchObject({
      status: "requires_review",
      difference: null,
      receiptDate: null,
      lossConfirmed: false
    })
    expect(result?.rows[0]?.blockers).toContain("receipt_period_unknown")
    expect(result?.rows[0]?.blockers.includes("invalid_net_receipt_quantity")).toBe(quantity < 0)
  }
})
