import { z } from "zod"
import { equalMoney, exactMoney, formatMoney, moneyTotals, sumMoney, type ExactMoney } from "@/lib/financial-money"

const object = z.record(z.string(), z.unknown())
const objects = z.array(object)
const transaction = z.object({
  id: z.string().min(1),
  kind: z.string(),
  status: z.string(),
  gateway: z.string().nullable().optional(),
  processedAt: z.string().nullable().optional(),
  parentTransaction: z.object({ id: z.string() }).nullable().optional(),
  amountSet: z.unknown(),
  fees: z.array(z.object({ amount: z.unknown(), taxAmount: z.unknown() }))
})
function money(value: unknown) {
  const raw = object.safeParse(value).data
  return exactMoney(raw?.amount, raw?.currencyCode)
}
function shopMoney(value: unknown) {
  return money(object.safeParse(value).data?.shopMoney)
}
function rendered(value: ExactMoney | null) {
  return value ? { amount: formatMoney(value), currency: value.currency } : null
}
function compare(target: ExactMoney | null, values: ExactMoney[], available: boolean) {
  if (!target || !available) {
    return "unavailable"
  }
  if (values.some((value) => value.currency !== target.currency)) {
    return "currency_mismatch"
  }
  return equalMoney(target, sumMoney(values, target.currency)) ? "balanced" : "amount_mismatch"
}
function difference(target: ExactMoney | null, values: ExactMoney[], available: boolean) {
  if (!target || !available || values.some((value) => value.currency !== target.currency)) {
    return null
  }
  return rendered(sumMoney([...values, { ...target, integer: -target.integer }], target.currency))
}

// These are successful payment events in an order snapshot, not revenue recognition or a payout ledger.
export function reconcileShopifyPayments(data: Record<string, unknown>) {
  const blockers = new Set<string>()
  const orderPayments = objects.safeParse(data.transactions)
  const refunds = objects.safeParse(data.refunds)
  if (!orderPayments.success) {
    blockers.add("missing_order_transactions")
  }
  if (!refunds.success) {
    blockers.add("missing_refunds")
  }
  const occurrences = (orderPayments.data ?? []).map((raw) => ({ raw, refundId: null as string | null }))
  const refundIds = new Set<string>()
  for (const refund of refunds.data ?? []) {
    if (typeof refund.id !== "string" || refundIds.has(refund.id)) {
      blockers.add("invalid_refund_identity")
      continue
    }
    refundIds.add(refund.id)
    const payments = objects.safeParse(refund.payments)
    if (!payments.success) {
      blockers.add("missing_refund_transactions")
    }
    for (const raw of payments.data ?? []) {
      occurrences.push({ raw, refundId: refund.id })
    }
  }
  const canonical = new Map<
    string,
    {
      payment: z.infer<typeof transaction>
      signature: string
      sources: Set<string>
      copies: number
    }
  >()
  const conflicts = new Set<string>()
  for (const { raw, refundId } of occurrences) {
    const parsed = transaction.safeParse(raw)
    if (!parsed.success) {
      blockers.add("invalid_transaction")
      if (typeof raw.id === "string") {
        conflicts.add(raw.id)
      }
      continue
    }
    const payment = parsed.data
    const signature = JSON.stringify({
      kind: payment.kind,
      status: payment.status,
      gateway: payment.gateway ?? null,
      parent: payment.parentTransaction?.id ?? null,
      processedAt: payment.processedAt ?? null,
      // Compare semantic values, not JSON object-key ordering or decimal scale.
      amount: moneySignature(shopMoney(payment.amountSet)),
      fees: payment.fees
        .map((fee) => JSON.stringify([moneySignature(money(fee.amount)), moneySignature(money(fee.taxAmount))]))
        .sort()
    })
    const prior = canonical.get(payment.id)
    if (prior) {
      prior.copies++
      if (prior.signature !== signature) {
        conflicts.add(payment.id)
      }
      prior.sources.add(refundId ?? "order")
    } else {
      canonical.set(payment.id, { payment, signature, copies: 1, sources: new Set([refundId ?? "order"]) })
    }
  }
  if (conflicts.size) {
    blockers.add("conflicting_transaction_copies")
  }
  const rows = [...canonical.values()]
    .map(({ payment, sources, copies }) => {
      const amount = shopMoney(payment.amountSet)
      const feeValues = payment.fees.map((fee) => ({ amount: money(fee.amount), tax: money(fee.taxAmount) }))
      const cashKind = ["SALE", "CAPTURE", "REFUND"].includes(payment.kind)
      let exclusion: string | null = null
      if (conflicts.has(payment.id)) {
        exclusion = "conflicting_copies"
      } else if (payment.status !== "SUCCESS") {
        exclusion = "not_successful"
      } else if (!cashKind) {
        exclusion = ["AUTHORIZATION", "VOID", "EMV_AUTHORIZATION"].includes(payment.kind)
          ? "non_payment"
          : "unsupported_kind"
      } else if (!amount || amount.integer < 0n) {
        exclusion = "invalid_amount"
      }
      if (exclusion === "invalid_amount" || exclusion === "unsupported_kind") {
        blockers.add(exclusion)
      }
      const parent = payment.parentTransaction?.id ?? null
      return {
        transactionId: payment.id,
        kind: payment.kind,
        status: payment.status,
        gateway: payment.gateway ?? null,
        processedAt: payment.processedAt ?? null,
        parentTransactionId: parent,
        parentAvailable: parent ? canonical.has(parent) : null,
        copies,
        refundIds: [...sources].filter((id) => id !== "order").sort(),
        amount: rendered(amount),
        presentmentAmount: rendered(money(object.safeParse(payment.amountSet).data?.presentmentMoney)),
        included: exclusion === null,
        exclusion,
        feeEvidence: feeValues.map((fee) => ({ amount: rendered(fee.amount), tax: rendered(fee.tax) })),
        feeEvidenceComplete: feeValues.every((fee) => fee.amount && fee.tax),
        feesCoverage: payment.gateway === "shopify_payments" ? "reported_only" : "external_gateway_not_covered"
      }
    })
    .sort((a, b) => a.transactionId.localeCompare(b.transactionId))
  const included = rows.filter((row) => row.included)
  const values = (kind: "inflow" | "refund") =>
    included
      .filter((row) => (row.kind === "REFUND") === (kind === "refund"))
      .flatMap((row) => {
        const value = shopMoney(canonical.get(row.transactionId)!.payment.amountSet)
        return value ? [value] : []
      })
  const inflows = values("inflow"),
    outflows = values("refund")
  const net = [...inflows, ...outflows.map((value) => ({ ...value, integer: -value.integer }))]
  const totalsAvailable = blockers.size === 0
  const refundResults = (refunds.data ?? []).map((refund) => {
    const payments = objects.safeParse(refund.payments)
    const ids = new Set((payments.data ?? []).flatMap((r) => (typeof r.id === "string" ? [r.id] : [])))
    const linked = rows.filter((row) => ids.has(row.transactionId))
    const paid = linked
      .filter((row) => row.included && row.kind === "REFUND")
      .flatMap((row) => {
        const value = shopMoney(canonical.get(row.transactionId)!.payment.amountSet)
        return value ? [value] : []
      })
    const shipping = objects.safeParse(refund.shipping)
    const shippingAmounts = (shipping.data ?? []).map((r) => shopMoney(r.subtotalAmountSet))
    const shippingTaxes = (shipping.data ?? []).map((r) => shopMoney(r.taxAmountSet))
    const available = totalsAvailable && payments.success && linked.length === ids.size
    return {
      refundId: typeof refund.id === "string" ? refund.id : null,
      reportedTotal: rendered(shopMoney(refund.totalRefundedSet)),
      successfulRefunds: available ? moneyTotals(paid) : null,
      paymentCheck: compare(shopMoney(refund.totalRefundedSet), paid, available),
      paymentDifference: difference(shopMoney(refund.totalRefundedSet), paid, available),
      unsuccessfulTransactionIds: linked.filter((row) => row.status !== "SUCCESS").map((row) => row.transactionId),
      shippingSubtotal:
        shipping.success && shippingAmounts.every((v) => v !== null)
          ? moneyTotals(shippingAmounts.filter((v) => v !== null))
          : null,
      shippingTax:
        shipping.success && shippingTaxes.every((v) => v !== null)
          ? moneyTotals(shippingTaxes.filter((v) => v !== null))
          : null,
      shippingMeaning: "refund_components_not_additional_payments",
      inventoryRestorationConfirmed: false
    }
  })
  const feeAmounts = included.flatMap((row) =>
    canonical.get(row.transactionId)!.payment.fees.map((fee) => money(fee.amount))
  )
  const feeTaxes = included.flatMap((row) =>
    canonical.get(row.transactionId)!.payment.fees.map((fee) => money(fee.taxAmount))
  )
  return {
    basis: "successful_payment_events_shop_currency",
    costBasis: "unknown",
    profit: null,
    blockers: [...blockers].sort(),
    transactions: rows,
    refunds: refundResults,
    duplicateCopiesRemoved: [...canonical.values()].reduce((count, value) => count + value.copies - 1, 0),
    totals: totalsAvailable
      ? { received: moneyTotals(inflows), refunded: moneyTotals(outflows), netPayments: moneyTotals(net) }
      : null,
    orderTotalCheck: compare(shopMoney(data.currentTotalPriceSet), net, totalsAvailable),
    orderComparison: {
      currentOrderTotal: rendered(shopMoney(data.currentTotalPriceSet)),
      difference: difference(shopMoney(data.currentTotalPriceSet), net, totalsAvailable),
      differenceMeaning: "successful_net_payments_minus_current_order_total",
      pendingPaymentIds: rows
        .filter(
          (r) => ["PENDING", "AWAITING_RESPONSE"].includes(r.status) && ["SALE", "CAPTURE", "REFUND"].includes(r.kind)
        )
        .map((r) => r.transactionId),
      failedPaymentIds: rows
        .filter((r) => ["FAILURE", "ERROR"].includes(r.status) && ["SALE", "CAPTURE", "REFUND"].includes(r.kind))
        .map((r) => r.transactionId),
      foreignPresentmentIds: rows
        .filter((r) => r.amount && r.presentmentAmount && r.amount.currency !== r.presentmentAmount.currency)
        .map((r) => r.transactionId),
      observationMeaning: "context_not_proof_of_difference_cause",
      cause: "not_determined",
      roundingApplied: false
    },
    orderTotalMeaning: "current_order_total_comparison_not_revenue",
    reportedFees:
      totalsAvailable && feeAmounts.every((v) => v !== null) ? moneyTotals(feeAmounts.filter((v) => v !== null)) : null,
    reportedFeeTaxes:
      totalsAvailable && feeTaxes.every((v) => v !== null) ? moneyTotals(feeTaxes.filter((v) => v !== null)) : null,
    feeMeaning: "reported_transaction_fees_not_additional_to_balance_fees",
    settlementReconciled: false
  }
}
function moneySignature(value: ExactMoney | null) {
  if (!value) {
    return null
  }
  return [
    value.currency,
    formatMoney(value)
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "")
  ]
}
