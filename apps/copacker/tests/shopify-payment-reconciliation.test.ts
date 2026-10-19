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
