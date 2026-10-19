import { expect, it } from "vitest"
import { reimbursementAccounting, type ReimbursementRecord } from "../src/server/amazon-reimbursement-accounting"
const original: ReimbursementRecord = {
  sourceRowId: "row1",
  id: "original",
  originalId: null,
  originalType: null,
  sku: "SKU",
  asin: "A",
  fnsku: "F",
  condition: "New",
  reason: "Lost_Warehouse",
  currency: "USD",
  amount: "20.45",
  quantityCash: 1,
  quantityInventory: 0,
  quantityTotal: 1
}
const reversal: ReimbursementRecord = {
  ...original,
  sourceRowId: "row2",
  id: "reversal",
  originalId: "original",
  originalType: "Lost_Warehouse",
  reason: "Reimbursement_Reversal",
  amount: "-20.45",
  quantityCash: -1,
  quantityInventory: 1,
  quantityTotal: 0
}
it("distinguishes an absent original from a contradictory original type", () => {
  const missing = reimbursementAccounting(reversal, [reversal], false)
  expect(missing.blockers).toEqual(["missing_original"])
  expect(missing.originalLookup.search).toBe("all_stored_records_in_account_marketplace")
  expect(reimbursementAccounting(reversal, [reversal], true).originalLookup.search).toBe("truncated")
  expect(
    reimbursementAccounting(reversal, [{ ...original, reason: "Damaged_Warehouse" }, reversal], false).blockers
  ).toContain("original_type_mismatch")
})
it("nets a referenced cash reversal separately from inventory recovery without recognizing new income", () => {
  const result = reimbursementAccounting(reversal, [original, reversal, original], false)
  expect(result).toMatchObject({
    status: "report_family_calculated",
    signedReportAmounts: [{ currency: "USD", amount: "0.00" }],
    quantities: { cash: 0, inventory: 1, total: 1 },
    financialPostingReconciled: false,
    additionalRecognizedAmount: null,
    inventoryRestorationConfirmed: false
  })
  expect(result.sourceRowIds).toEqual(["row1", "row2"])
})
it("withholds family totals for missing, ambiguous, conflicting and truncated evidence", () => {
  const fixtures = [
    { rows: [reversal], truncated: false, blocker: "missing_original" },
    {
      rows: [original, reversal, { ...original, sourceRowId: "duplicate" }],
      truncated: false,
      blocker: "ambiguous_original"
    },
    { rows: [original, reversal], truncated: true, blocker: "related_records_truncated" },
    { rows: [original, { ...reversal, currency: "CAD" }], truncated: false, blocker: "currency_mismatch" },
    { rows: [original, { ...reversal, quantityTotal: 5 }], truncated: false, blocker: "quantity_mismatch" },
    {
      rows: [original, reversal, { ...reversal, sourceRowId: "third", id: "second-reversal", originalId: "reversal" }],
      truncated: false,
      blocker: "multi_step_chain_requires_review"
    }
  ]
  for (const fixture of fixtures) {
    const result = reimbursementAccounting(reversal, fixture.rows, fixture.truncated)
    expect(result.blockers).toContain(fixture.blocker)
    expect(result.signedReportAmounts).toBeNull()
    expect(result.quantities).toBeNull()
  }
})
it("does not net different products sharing a reimbursement ID", () => {
  const result = reimbursementAccounting(
    reversal,
    [original, reversal, { ...original, sourceRowId: "other", sku: "OTHER", amount: "100" }],
    false
  )
  expect(result.signedReportAmounts).toEqual([{ currency: "USD", amount: "0.00" }])
})
