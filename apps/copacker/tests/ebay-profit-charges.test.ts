import { randomUUID } from "node:crypto"
import { ebayTransactionKey, type EbayFinancialTransaction } from "@repo/copacker-marketplaces/ebay-finances"
import { beforeEach, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { database, setUpTestDatabase } from "./test-db"

vi.mock("@/db", () => import("./test-db"))
import { listIngestionEvidence } from "../src/server/analytics-ingestion"
import { orderFees, platformCharges } from "../src/server/overview-sales"

setUpTestDatabase({ truncate: true })
const orgId = randomUUID(),
  otherId = randomUUID()
const account = { provider: "ebay" as const, externalId: "seller" }
const from = new Date("2026-10-01T00:00:00Z"),
  to = new Date("2026-11-01T00:00:00Z")
beforeEach(async () => {
  await database.insert(tables.organizations).values([
    { id: orgId, kind: "buyer", name: "Buyer" },
    { id: otherId, kind: "buyer", name: "Other" }
  ])
})
function transaction(
  id: string,
  value: string,
  overrides: Partial<EbayFinancialTransaction> = {}
): EbayFinancialTransaction {
  return {
    transactionId: id,
    transactionDate: "2026-10-15T00:00:00Z",
    transactionType: "NON_SALE_CHARGE",
    feeType: "INSERTION_FEE",
    bookingEntry: "DEBIT",
    amount: { value, currency: "USD" },
    ...overrides
  }
}
async function save(data: EbayFinancialTransaction, scope: { orgId?: string; externalAccountId?: string } = {}) {
  await database
    .insert(tables.analyticsEvidence)
    .values({
      orgId,
      source: "ebay",
      externalAccountId: "seller",
      dataset: "financial_transactions",
      sourceId: ebayTransactionKey(data),
      data,
      ...scope
    })
    .onConflictDoUpdate({
      target: [
        tables.analyticsEvidence.orgId,
        tables.analyticsEvidence.source,
        tables.analyticsEvidence.externalAccountId,
        tables.analyticsEvidence.dataset,
        tables.analyticsEvidence.sourceId
      ],
      set: { data }
    })
}
const charges = (currency = "USD") => platformCharges(orgId, [account], from, to, currency)

it("counts standalone costs and their credits once without recounting sales, refunds, fees or transfers", async () => {
  const included = [
    transaction("listing", "0.35"),
    transaction("listing-credit", "0.10", { bookingEntry: "CREDIT" }),
    transaction("store", "20", { feeType: "EBAY_STORE_SUBSCRIPTION_FEE" }),
    transaction("click-ads", "3", { feeType: "PREMIUM_AD_FEES" }),
    transaction("label", "5", { transactionType: "SHIPPING_LABEL", orderId: "O1" }),
    transaction("label-credit", "1", { transactionType: "SHIPPING_LABEL", bookingEntry: "CREDIT", orderId: "O1" })
  ]
  for (const row of included) {
    await save(row)
    await save(row) // The rolling window and exact payout lookup upsert the same identity.
  }
  for (const type of ["SALE", "REFUND", "TRANSFER", "DISPUTE", "CREDIT", "ADJUSTMENT", "FUTURE_TYPE"]) {
    await save(transaction(type, "100", { transactionType: type, totalFeeAmount: { value: "12.27", currency: "USD" } }))
  }
  for (const feeType of [
    "FINAL_VALUE_FEE",
    "FINAL_VALUE_FEE_FIXED_PER_ORDER",
    "PAYMENT_PROCESSING_FEE",
    "AD_FEE",
    "OTHER_FEES",
    "INCOME_TAX_WITHHOLDING",
    "VAT_WITHHOLDING",
    "TAX_DEDUCTION_AT_SOURCE",
    "FUTURE_FEE"
  ]) {
    await save(transaction(feeType, "100", { feeType }))
  }
  await database.insert(tables.analyticsEvidence).values({
    orgId,
    source: "ebay",
    externalAccountId: "seller",
    dataset: "payouts",
    sourceId: "P1",
    data: { amount: { value: "999", currency: "USD" }, totalFee: { value: "5", currency: "USD" } }
  })
  await database.insert(tables.salesOrders).values({
    orgId,
    source: "ebay",
    externalAccountId: "seller",
    orderId: "O1",
    orderedAt: new Date("2026-10-15"),
    data: {
      orderId: "O1",
      creationDate: "2026-10-15T00:00:00Z",
      orderFulfillmentStatus: "FULFILLED",
      totalMarketplaceFee: { value: "12.27", currency: "USD" },
      lineItems: [{ lineItemId: "L1", title: "Mask", quantity: 1, lineItemCost: { value: "100", currency: "USD" } }]
    }
  })
  expect(await charges()).toEqual([{ key: "ebay-charges", label: "eBay charges", minor: -2725, currency: "USD" }])
  expect(await orderFees(orgId, account, from, to, "USD")).toMatchObject([{ orderId: "O1", feesMinor: 1227 }])
  const evidence = await listIngestionEvidence(orgId, {
    source: "ebay",
    externalAccountId: "seller",
    dataset: "financial_transactions",
    page: 0
  })
  expect(evidence.rows.find((row) => row.data.transactionId === "listing")?.profitTreatment).toBe("additional_charge")
  expect(evidence.rows.find((row) => row.data.transactionId === "SALE")?.profitTreatment).toBe(
    "order_transaction_not_added"
  )
  expect(evidence.rows.find((row) => row.data.transactionId === "TRANSFER")?.profitTreatment).toBe(
    "transfer_not_profit"
  )
  expect(evidence.rows.find((row) => row.data.transactionId === "AD_FEE")?.profitTreatment).toBe("requires_review")
})

it("keeps ambiguous order-linked non-sale charges and unknown statuses out of profit", async () => {
  for (const [id, extra] of Object.entries({
    order: { orderId: "O1" },
    line: { orderLineItems: [{ lineItemId: "L1" }] },
    reference: { references: [{ referenceType: "ORDER_ID", referenceId: "O1" }] },
    unknownReference: { references: [{ referenceType: "FUTURE_REFERENCE", referenceId: "R1" }] },
    failed: { transactionStatus: "FAILED" },
    future: { transactionStatus: "FUTURE_STATUS" }
  })) {
    await save(transaction(id, "100", extra))
  }
  expect(await charges()).toEqual([])
  await save(
    transaction("available", "0.35", {
      transactionStatus: "FUNDS_AVAILABLE_FOR_PAYOUT",
      references: [{ referenceType: "ITEM_ID", referenceId: "I1" }]
    })
  )
  expect(await charges()).toMatchObject([{ minor: -35 }])
})

it("uses the charge date rather than the payout date and scopes to the selected account and workspace", async () => {
  await save(transaction("before", "10", { transactionDate: "2026-09-30T23:59:59Z", payoutId: "October-payout" }))
  await save(transaction("start", "2", { transactionDate: from.toISOString() }))
  await save(transaction("end", "10", { transactionDate: to.toISOString() }))
  await save(transaction("foreign-org", "100"), { orgId: otherId })
  await save(transaction("foreign-account", "100"), { externalAccountId: "old-seller" })
  expect(await charges()).toMatchObject([{ minor: -200 }])
  expect(await platformCharges(orgId, [], from, to, "USD")).toEqual([])
})

it("converts each charge at its posted date and never returns a partial total with missing exchange rates", async () => {
  await database.insert(tables.exchangeRates).values([
    { day: "2026-10-01", currency: "CAD", perUsd: "2" },
    { day: "2026-10-20", currency: "CAD", perUsd: "4" }
  ])
  await save(transaction("early", "4", { amount: { value: "4", currency: "CAD" } }))
  await save(
    transaction("late", "4", { transactionDate: "2026-10-21T00:00:00Z", amount: { value: "4", currency: "CAD" } })
  )
  expect(await charges()).toMatchObject([{ minor: -300 }])
  await save(transaction("no-rate", "3", { amount: { value: "3", currency: "ZZZ" } }))
  expect(await charges()).toEqual([])
  await save(transaction("other-seller", "5"), { externalAccountId: "other-seller" })
  const otherAccount = { provider: "ebay" as const, externalId: "other-seller" }
  expect(await platformCharges(orgId, [otherAccount], from, to, "USD")).toMatchObject([{ minor: -500 }])
  for (const accounts of [
    [account, otherAccount],
    [otherAccount, account]
  ]) {
    expect(await platformCharges(orgId, accounts, from, to, "USD")).toEqual([])
  }
})
