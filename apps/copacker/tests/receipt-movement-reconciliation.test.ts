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
    status: "quantity_agrees",
    movementQuantity: 8,
    difference: 0,
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
  expect(different?.rows[0]).toMatchObject({ status: "quantity_differs", difference: -1 })
})
it("withholds totals for incomplete searches, absent references and AWD units", () => {
  for (const [dataset, rows, truncated] of [
    ["fba_inbound_receipts", [movement], true],
    ["fba_inbound_receipts", [], false],
    ["awd_inbound_receipts", [movement], false],
    ["fba_inbound_receipts", [movement, { ...movement, id: "unknown", sku: null }], false]
  ] as const) {
    expect(
      reconcileReceiptMovements(dataset, "SHIP", receipt, [...rows], truncated)?.rows[0]?.movementQuantity
    ).toBeNull()
  }
})
