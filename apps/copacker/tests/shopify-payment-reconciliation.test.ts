import { expect, it } from "vitest"
import { shopifyBalanceComparison } from "../src/server/shopify-balance-comparison"
import { reconcileShopifyPayments } from "../src/server/shopify-payment-reconciliation"
const money = (amount: string, currencyCode = "USD") => ({ amount, currencyCode })
const bag = (amount: string, currency = "USD") => ({
  shopMoney: money(amount, currency),
  presentmentMoney: money("999", "CAD")
})
const payment = (id: string, kind: string, amount: string, status = "SUCCESS") => ({
  id,
  kind,
  status,
  gateway: "shopify_payments",
  processedAt: "2026-09-01T00:00:00Z",
  parentTransaction: null,
  amountSet: bag(amount),
  fees: [{ amount: money("0.50"), taxAmount: money("0.05") }]
})
const refund = (payments: unknown[]) => ({
  id: "R",
  payments,
  totalRefundedSet: bag("20"),
  shipping: [{ subtotalAmountSet: bag("5"), taxAmountSet: bag("1") }]
})
it("classifies linked equal presentment refunds without recognizing an FX gain or changing totals", () => {
  const sale = {
    ...payment("S", "SALE", "15.63"),
    amountSet: { shopMoney: money("15.63"), presentmentMoney: money("21", "CAD") }
  }
  const returned = {
    ...payment("R", "REFUND", "15.69"),
    parentTransaction: { id: "S" },
    amountSet: { shopMoney: money("15.69"), presentmentMoney: money("21.00", "CAD") }
  }
  const result = reconcileShopifyPayments({
    currentTotalPriceSet: bag("0"),
    transactions: [sale, returned],
    refunds: [refund([returned])]
  })
  expect(result.orderComparison.linkedRefundComparisons).toEqual([
    expect.objectContaining({
      parentTransactionId: "S",
      refundTransactionIds: ["R"],
      classification: "equal_presentment_different_shop_amounts",
      shopDifference: { amount: "0.06", currency: "USD" },
      presentmentDifference: { amount: "0.00", currency: "CAD" },
      accountingEffect: "not_determined"
    })
  ])
  expect(result.orderComparison.difference).toEqual({ amount: "-0.06", currency: "USD" })
  expect(result.orderComparison.cause).toBe("not_determined")
  expect(result.duplicateCopiesRemoved).toBe(1)
  expect(result.settlementReconciled).toBe(false)
})
it("groups split linked refunds once and does not pair by amount alone", () => {
  const first = {
    ...payment("R1", "REFUND", "4"),
    parentTransaction: { id: "S" },
    amountSet: { shopMoney: money("4"), presentmentMoney: money("5", "CAD") }
  }
  const second = { ...first, id: "R2" }
  const sale = {
    ...payment("S", "SALE", "8"),
    amountSet: { shopMoney: money("8"), presentmentMoney: money("10", "CAD") }
  }
  const result = reconcileShopifyPayments({
    transactions: [sale, first, second, payment("unlinked", "REFUND", "8")],
    refunds: []
  })
  expect(result.orderComparison.linkedRefundComparisons).toEqual([
    expect.objectContaining({ classification: "equal_linked_payment_and_refunds", refundTransactionIds: ["R1", "R2"] })
  ])
  const missing = reconcileShopifyPayments({ transactions: [first], refunds: [] })
  expect(missing.orderComparison.linkedRefundComparisons).toEqual([])
})
it("withholds linked comparisons for conflicting presentment copies and missing or mixed currencies", () => {
  const sale = payment("S", "SALE", "10")
  const returned = { ...payment("R", "REFUND", "11"), parentTransaction: { id: "S" } }
  for (const presentmentMoney of [undefined, money("999", "EUR"), money("-999", "CAD")]) {
    const result = reconcileShopifyPayments({
      transactions: [sale, { ...returned, amountSet: { shopMoney: money("11"), presentmentMoney } }],
      refunds: []
    })
    expect(result.orderComparison.linkedRefundComparisons[0]?.classification).toBe("unresolved_linked_refund_amounts")
  }
  const conflicting = { ...returned, amountSet: { ...returned.amountSet, presentmentMoney: money("998", "CAD") } }
  for (const copies of [
    [returned, conflicting],
    [conflicting, returned]
  ]) {
    const result = reconcileShopifyPayments({ transactions: [sale, ...copies], refunds: [] })
    expect(result.totals).toBeNull()
    expect(result.orderComparison.linkedRefundComparisons).toEqual([])
  }
})
it("explains observed payment states and exact differences without inventing refunds or an FX cause", () => {
  const result = reconcileShopifyPayments({
    currentTotalPriceSet: bag("0"),
    transactions: [
      payment("S", "SALE", "6.80"),
      payment("R", "REFUND", "6.80", "PENDING"),
      payment("F", "REFUND", "6.80", "FAILURE")
    ],
    refunds: []
  })
  expect(result.orderComparison).toMatchObject({
    difference: { amount: "6.80", currency: "USD" },
    pendingPaymentIds: ["R"],
    failedPaymentIds: ["F"],
    cause: "not_determined",
    roundingApplied: false
  })
  expect(result.totals?.refunded).toEqual([])
  expect(result.orderComparison.paymentStateObservations).toEqual([
    expect.objectContaining({ transactionId: "F", direction: "refund", state: "failed" }),
    expect.objectContaining({ transactionId: "R", direction: "refund", state: "pending" })
  ])
  const cents = reconcileShopifyPayments({
    currentTotalPriceSet: bag("6.81"),
    transactions: [payment("S", "SALE", "6.80")],
    refunds: []
  })
  expect(cents.orderComparison.difference).toEqual({ amount: "-0.01", currency: "USD" })
  const mixed = reconcileShopifyPayments({
    currentTotalPriceSet: bag("6.80", "EUR"),
    transactions: [payment("S", "SALE", "6.80")],
    refunds: []
  })
  expect(mixed.orderComparison.difference).toBeNull()
})
it("counts successful payments once across refund and order records without adding shipping or authorizations", () => {
  const r = payment("R1", "REFUND", "20")
  const result = reconcileShopifyPayments({
    currentTotalPriceSet: bag("80"),
    transactions: [
      payment("A", "AUTHORIZATION", "100"),
      payment("C", "CAPTURE", "100"),
      r,
      payment("F", "REFUND", "15", "FAILURE")
    ],
    refunds: [refund([r])]
  })
  expect(result.duplicateCopiesRemoved).toBe(1)
  expect(result.totals).toEqual({
    received: [{ currency: "USD", amount: "100" }],
    refunded: [{ currency: "USD", amount: "20" }],
    netPayments: [{ currency: "USD", amount: "80" }]
  })
  expect(result.orderTotalCheck).toBe("balanced")
  expect(result.reportedFees).toEqual([{ currency: "USD", amount: "1.00" }])
  expect(result.reportedFeeTaxes).toEqual([{ currency: "USD", amount: "0.10" }])
  expect(result.refunds[0]).toMatchObject({
    paymentCheck: "balanced",
    shippingSubtotal: [{ currency: "USD", amount: "5" }],
    inventoryRestorationConfirmed: false
  })
  expect(result.costBasis).toBe("unknown")
})
it("does not mistake a pending refund object for a successful refund", () => {
  const result = reconcileShopifyPayments({
    transactions: [payment("C", "SALE", "100")],
    refunds: [refund([payment("R1", "REFUND", "20", "PENDING")])]
  })
  expect(result.totals?.refunded).toEqual([])
  expect(result.refunds[0]).toMatchObject({ paymentCheck: "amount_mismatch", unsuccessfulTransactionIds: ["R1"] })
})
it("withholds totals for conflicting duplicate transactions regardless of copy order", () => {
  const a = payment("R1", "REFUND", "20"),
    b = payment("R1", "REFUND", "21")
  for (const [first, second] of [
    [a, b],
    [b, a]
  ]) {
    const result = reconcileShopifyPayments({ transactions: [first], refunds: [refund([second])] })
    expect(result.totals).toBeNull()
    expect(result.blockers).toContain("conflicting_transaction_copies")
    expect(result.transactions[0]?.included).toBe(false)
  }
})
it("accepts semantically identical money copies and preserves precision and currency separation", () => {
  const a = payment("R1", "REFUND", "0.1000"),
    b = payment("R1", "REFUND", "0.1")
  const result = reconcileShopifyPayments({
    transactions: [
      a,
      payment("S", "SALE", "9007199254740993.123456789"),
      { ...payment("E", "SALE", "2"), amountSet: bag("2", "EUR") }
    ],
    refunds: [{ ...refund([b]), totalRefundedSet: bag("0.1") }]
  })
  expect(result.blockers).toEqual([])
  expect(result.totals?.netPayments).toEqual([
    { currency: "EUR", amount: "2" },
    { currency: "USD", amount: "9007199254740993.023456789" }
  ])
})
it("keeps missing, invalid and unknown financial inputs explicit", () => {
  expect(reconcileShopifyPayments({}).totals).toBeNull()
  expect(
    reconcileShopifyPayments({ transactions: [payment("X", "FUTURE_KIND", "3")], refunds: [] }).blockers
  ).toContain("unsupported_kind")
  expect(reconcileShopifyPayments({ transactions: [payment("X", "SALE", "-3")], refunds: [] }).totals).toBeNull()
  const result = reconcileShopifyPayments({
    transactions: [{ ...payment("X", "SALE", "3"), gateway: "paypal", fees: [] }],
    refunds: []
  })
  expect(result.transactions[0]?.feesCoverage).toBe("external_gateway_not_covered")
  expect(result.settlementReconciled).toBe(false)
  const invalid = reconcileShopifyPayments({ transactions: [{ malformed: true }], refunds: [] })
  expect(invalid.duplicateCopiesRemoved).toBe(0)
  expect(invalid.totals).toBeNull()
})
it("checks balance arithmetic while keeping charge and refund fees separate from order fees", () => {
  const result = shopifyBalanceComparison(
    [
      { transactionId: "B", type: "CHARGE", data: { amount: money("10"), fee: money("1"), net: money("9") } },
      { transactionId: "R", type: "REFUND", data: { amount: money("-5"), fee: money("0"), net: money("-5") } },
      { transactionId: "M", type: "ADJUSTMENT", data: {} }
    ],
    true
  )
  expect(result.arithmetic).toEqual([
    { transactionId: "B", check: "balanced" },
    { transactionId: "R", check: "balanced" },
    { transactionId: "M", check: "unavailable" }
  ])
  expect(result).toMatchObject({ truncated: true, settlementReconciled: false, additionalRecognizedAmount: null })
})
