import {
  ebayTransactionKey,
  type EbayFinancialTransaction,
  type EbayPayout
} from "@repo/copacker-marketplaces/ebay-finances"
import { equalMoney, exactMoney, moneyTotals, sumMoney } from "@/lib/financial-money"

// Compare signed net amounts by exact payout reference, without treating a transfer or its fees as new income.
export function reconcileEbayPayout(payout: EbayPayout, transactions: EbayFinancialTransaction[]) {
  const rows = transactions.filter((row) => row.payoutId === payout.payoutId)
  const amounts = rows.map((row) =>
    exactMoney(`${row.bookingEntry === "DEBIT" ? "-" : ""}${row.amount.value}`, row.amount.currency)
  )
  const valid = amounts.filter((value) => value !== null)
  const expected = payout.totalAmount ?? payout.amount
  const target = exactMoney(expected.value, expected.currency)
  let status = "amount_mismatch"
  if (payout.payoutReference || rows.some((row) => row.payoutDetails)) {
    status = "split_payout_requires_allocation"
  } else if (new Set(rows.map(ebayTransactionKey)).size !== rows.length) {
    status = "duplicate_transactions"
  } else if (payout.transactionCount === undefined) {
    status = "transaction_count_unknown"
  } else if (rows.length !== payout.transactionCount) {
    status = "missing_transactions"
  } else if (valid.length !== rows.length || !target) {
    status = "invalid_amount"
  } else if (
    payout.amount.currency !== expected.currency ||
    valid.some((value) => value.currency !== expected.currency)
  ) {
    status = "currency_mismatch"
  } else if (payout.payoutStatus !== "SUCCEEDED") {
    status = "payout_not_succeeded"
  } else if (equalMoney(sumMoney(valid, expected.currency), target)) {
    status = "balanced"
  }
  return {
    status,
    transactionIds: rows.map((row) => row.transactionId),
    expectedCount: payout.transactionCount ?? null,
    observedCount: rows.length,
    transactionNet: moneyTotals(valid),
    expected,
    basis: "exact_payout_reference_net_transactions",
    additionalRecognizedAmount: null,
    feeMeaning: "transaction_amount_is_net_do_not_subtract_totalFeeAmount_again"
  }
}
