import { z } from "zod"
import { equalMoney, exactMoney, moneyTotals, sumMoney } from "@/lib/financial-money"
const object = z.record(z.string(), z.unknown())
const amount = (value: unknown) => {
  const raw = object.safeParse(value).data
  return exactMoney(raw?.amount, raw?.currencyCode)
}
export function shopifyBalanceComparison(
  rows: { transactionId: string; type: string; data: Record<string, unknown> }[],
  truncated: boolean
) {
  const totals = [...new Set(rows.map((row) => row.type))].sort().map((type) => {
    const selected = rows.filter((row) => row.type === type)
    const amounts = selected.map((row) => amount(row.data.amount))
    const fees = selected.map((row) => amount(row.data.fee))
    const nets = selected.map((row) => amount(row.data.net))
    return {
      type,
      rows: selected.length,
      amounts: amounts.every((v) => v !== null) ? moneyTotals(amounts.filter((v) => v !== null)) : null,
      fees: fees.every((v) => v !== null) ? moneyTotals(fees.filter((v) => v !== null)) : null,
      net: nets.every((v) => v !== null) ? moneyTotals(nets.filter((v) => v !== null)) : null
    }
  })
  return {
    basis: "same_order_reference_not_transaction_match",
    truncated,
    totals,
    arithmetic: rows.map((row) => {
      const gross = amount(row.data.amount),
        fee = amount(row.data.fee),
        net = amount(row.data.net)
      let check = "unavailable"
      if (gross && fee && net) {
        if (gross.currency !== fee.currency || gross.currency !== net.currency) {
          check = "currency_mismatch"
        } else {
          check = equalMoney(sumMoney([gross, { ...fee, integer: -fee.integer }], gross.currency), net)
            ? "balanced"
            : "amount_mismatch"
        }
      }
      return { transactionId: row.transactionId, check }
    }),
    settlementReconciled: false,
    additionalRecognizedAmount: null,
    missingRowsMeaning: "coverage_or_linkage_unknown",
    feeMeaning: "alternative_fee_evidence_do_not_add_to_transaction_fees"
  }
}
