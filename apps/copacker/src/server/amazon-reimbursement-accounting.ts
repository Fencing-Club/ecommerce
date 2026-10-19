import { exactMoney, moneyTotals } from "@/lib/financial-money"

export type ReimbursementRecord = {
  sourceRowId: string
  id: string
  originalId: string | null
  originalType: string | null
  sku: string | null
  asin: string | null
  fnsku: string | null
  condition: string | null
  reason: string | null
  currency: string | null
  amount: string | null
  quantityCash: number | null
  quantityInventory: number | null
  quantityTotal: number | null
}
// A report family is evidence of cash/inventory recovery changes, never an additional financial posting.
export function reimbursementAccounting(row: ReimbursementRecord, records: ReimbursementRecord[], truncated: boolean) {
  const rootId = row.originalId ?? row.id
  const sameItem = (other: ReimbursementRecord) =>
    row.sku !== null &&
    row.sku === other.sku &&
    row.asin === other.asin &&
    row.fnsku === other.fnsku &&
    row.condition === other.condition
  const family = [
    ...new Map(
      records
        .filter((other) => (other.id === rootId || other.originalId === rootId) && sameItem(other))
        .map((other) => [other.sourceRowId, other])
    ).values()
  ]
  const blockers: string[] = []
  const hasStoredOriginal = records.some((other) => other.id === rootId)
  const roots = family.filter((other) => other.id === rootId)
  if (truncated) {
    blockers.push("related_records_truncated")
  }
  if (!row.sku) {
    blockers.push("missing_product_identity")
  }
  if (roots.length !== 1) {
    if (roots.length) {
      blockers.push("ambiguous_original")
    } else {
      blockers.push(hasStoredOriginal ? "original_item_identity_unresolved" : "missing_original")
    }
  }
  if (family.some((other) => other.id === rootId && other.originalId !== null)) {
    blockers.push("multi_step_chain_requires_review")
  }
  if (
    records.some(
      (other) =>
        other.originalId !== null &&
        other.originalId !== rootId &&
        family.some((member) => member.id === other.originalId)
    )
  ) {
    blockers.push("multi_step_chain_requires_review")
  }
  if (new Set(family.map((other) => other.id)).size !== family.length) {
    blockers.push("ambiguous_reimbursement_lines")
  }
  if (
    roots.length === 1 &&
    roots[0]!.reason &&
    family.some((other) => other.originalId && other.originalType && roots[0]!.reason !== other.originalType)
  ) {
    blockers.push("original_type_mismatch")
  }
  if (
    family.some(
      (other) => other.quantityCash === null || other.quantityInventory === null || other.quantityTotal === null
    )
  ) {
    blockers.push("missing_quantities")
  }
  if (
    family.some(
      (other) =>
        other.quantityCash !== null &&
        other.quantityInventory !== null &&
        other.quantityTotal !== null &&
        other.quantityCash + other.quantityInventory !== other.quantityTotal
    )
  ) {
    blockers.push("quantity_mismatch")
  }
  const amounts = family.map((other) => exactMoney(other.amount, other.currency))
  if (amounts.some((value) => value === null)) {
    blockers.push("missing_amount_or_currency")
  }
  if (new Set(family.map((other) => other.currency)).size > 1) {
    blockers.push("currency_mismatch")
  }
  // Never assign a partial net when another reversal names this family but its item identity is contradictory.
  if (
    records.some((other) => other.originalId === rootId && !sameItem(other) && (other.sku === row.sku || !other.sku))
  ) {
    blockers.push("conflicting_item_identity")
  }
  const available = blockers.length === 0
  return {
    rootReimbursementId: rootId,
    originalLookup: {
      status: hasStoredOriginal ? "found" : "unresolved",
      itemIdentity: roots.length === 1 ? "matched" : "unresolved",
      search: truncated ? "truncated" : "all_stored_records_in_account_marketplace",
      absenceMeaning: hasStoredOriginal ? null : "not_found_in_stored_evidence_not_proof_of_provider_absence"
    },
    sourceRowIds: family.map((other) => other.sourceRowId).sort(),
    status: available ? "report_family_calculated" : "requires_review",
    blockers,
    signedReportAmounts: available ? moneyTotals(amounts.filter((value) => value !== null)) : null,
    quantities: available
      ? {
          cash: family.reduce((sum, other) => sum + other.quantityCash!, 0),
          inventory: family.reduce((sum, other) => sum + other.quantityInventory!, 0),
          total: family.reduce((sum, other) => sum + other.quantityTotal!, 0),
          unit: "provider_units"
        }
      : null,
    totalsMeaning: "family_context_repeated_per_row_do_not_sum",
    coverage: "stored_records_only",
    financialPostingReconciled: false,
    additionalRecognizedAmount: null,
    inventoryRestorationConfirmed: false,
    costBasis: "unknown"
  }
}
