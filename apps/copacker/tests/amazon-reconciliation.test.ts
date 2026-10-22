import { describe, expect, it } from "vitest"
import {
  type AmazonEvidence,
  type ReconciliationPosting,
  postingEvidence,
  reconcileAmazonEvidence
} from "../src/server/amazon-reconciliation"
const row: AmazonEvidence = {
  id: "R1",
  source: "returns",
  occurredAt: "2026-10-01T00:00:00Z",
  marketplaceId: "US",
  sku: "SKU1",
  asin: "A1",
  fnsku: "FN1",
  orderId: "ORDER1",
  currency: "USD",
  amount: "0.3"
}
const money = (value: string, currency = "USD") => ({ currencyAmount: value, currencyCode: currency })
const posting: ReconciliationPosting = {
  transactionId: "T1",
  orderId: "ORDER1",
  postedAt: new Date("2026-10-02"),
  type: "Refund",
  currency: "USD",
  data: {
    transactionStatus: "RELEASED",
    marketplaceDetails: { marketplaceId: "US" },
    totalAmount: money("0.3"),
    breakdowns: [
      { breakdownAmount: money("0.1"), breakdowns: [{ breakdownAmount: money("0.1") }] },
      { breakdownAmount: money("0.2") }
    ],
    items: [{ totalAmount: money("0.3"), contexts: [{ contextType: "ProductContext", sku: "SKU1", asin: "A1" }] }]
  }
}
const inventory = [{ sku: "SKU1", asin: "A1", fnsku: "FN1" }]
it("ranks signed reimbursement equality above proximity without promoting it to a match", () => {
  const source = { ...row, source: "reimbursements", orderId: null }
  const exact = {
    ...posting,
    orderId: null,
    type: "FBAInventoryReimbursement",
    transactionId: "exact",
    postedAt: new Date("2025-01-01")
  }
  const opposite = {
    ...exact,
    transactionId: "opposite",
    postedAt: new Date("2026-10-01"),
    data: { ...exact.data, totalAmount: money("-0.3") }
  }
  const result = reconcileAmazonEvidence([source], inventory, [opposite, exact])[0]!
  expect(result.finance.candidates.map((r) => r.transactionId)).toEqual(["exact", "opposite"])
  expect(result.finance.matching).toMatchObject({ sameSignedAmountCount: 1, ambiguity: "multiple_candidates" })
  expect(result.finance.reconciled).toBe(false)
  expect(result.finance.candidates[1]?.checks.transactionMinusSource).toEqual({ currency: "USD", amount: "-0.6" })
})
describe("Amazon reconciliation evidence", () => {
  it.each([
    ["returns", "Refund"],
    ["reimbursements", "FBAInventoryReimbursement"]
  ])("keeps relevant %s postings visible ahead of unrelated sales without certifying a match", (source, type) => {
    const postings = Array.from({ length: 25 }, (_, i) => ({
      ...posting,
      orderId: null,
      type: "Shipment",
      transactionId: `A${i}`
    }))
    postings.push({ ...posting, orderId: null, type, transactionId: "Z-near" })
    postings.push({ ...posting, orderId: null, type, transactionId: "Z-far", postedAt: new Date("2025-01-01") })
    const result = reconcileAmazonEvidence([{ ...row, source, orderId: null }], inventory, postings)[0]
    expect(result?.finance.candidates.slice(0, 2).map((candidate) => candidate.transactionId)).toEqual([
      "Z-near",
      "Z-far"
    ])
    expect(result?.finance).toMatchObject({ candidateCount: 27, reconciled: false })
  })
  it("links observed product identity and order/product candidates without recognizing money twice", () => {
    const [result] = reconcileAmazonEvidence([row], inventory, [posting])
    expect(result?.product.status).toBe("matched_current")
    expect(result?.finance).toMatchObject({
      status: "candidates",
      reconciled: false,
      candidateCount: 1,
      candidates: [
        {
          basis: "order_reference",
          itemIndexes: [0],
          currencyMatches: true,
          totals: { breakdowns: "balanced", items: "balanced" }
        }
      ]
    })
  })
  it("does not arbitrarily choose among shared ASINs or silently override contradictory identifiers", () => {
    expect(
      reconcileAmazonEvidence(
        [{ ...row, sku: null, fnsku: null }],
        [...inventory, { sku: "SKU2", asin: "A1", fnsku: "FN2" }],
        []
      )[0]?.product.status
    ).toBe("ambiguous")
    expect(reconcileAmazonEvidence([{ ...row, asin: "WRONG" }], inventory, [])[0]?.product.status).toBe(
      "conflicting_identifiers"
    )
    expect(
      reconcileAmazonEvidence([{ ...row, sku: null, asin: null, fnsku: null }], inventory, [])[0]?.product.status
    ).toBe("missing_identifiers")
    expect(reconcileAmazonEvidence([row], [], [])[0]?.product.status).toBe("unmatched")
  })
  it("uses all available identifiers to disambiguate a shared ASIN", () => {
    expect(
      reconcileAmazonEvidence([row], [...inventory, { sku: "SKU2", asin: "A1", fnsku: "FN2" }], [])[0]?.product
    ).toMatchObject({ status: "matched_current", candidateCount: 1 })
  })
  it("does not certify unsafe numeric JSON amounts", () => {
    expect(
      postingEvidence({
        ...posting,
        data: {
          totalAmount: { currencyCode: "USD", currencyAmount: 1e20 },
          breakdowns: [{ breakdownAmount: { currencyCode: "USD", currencyAmount: 1e20 } }]
        }
      }).totals.breakdowns
    ).toBe("unavailable")
  })
  it("deduplicates identical observed identities but keeps split source records separate", () => {
    const result = reconcileAmazonEvidence([row, { ...row, id: "R2" }], [...inventory, ...inventory], [posting])
    expect(result).toHaveLength(2)
    expect(result.every((value) => value.product.status === "matched_current")).toBe(true)
  })
  it("does not match another marketplace or a conflicting product on value similarity alone", () => {
    const changed = {
      ...posting,
      orderId: null,
      data: { ...posting.data, marketplaceDetails: { marketplaceId: "OTHER" } }
    }
    expect(reconcileAmazonEvidence([row], inventory, [changed])[0]?.finance.candidates).toEqual([])
    const wrong = {
      ...posting,
      orderId: null,
      data: { ...posting.data, items: [{ contexts: [{ contextType: "ProductContext", sku: "SKU1", asin: "WRONG" }] }] }
    }
    expect(reconcileAmazonEvidence([row], inventory, [wrong])[0]?.finance.candidates).toEqual([])
    expect(
      reconcileAmazonEvidence([{ ...row, orderId: null, sku: null, asin: null }], inventory, [posting])[0]?.finance
        .status
    ).toBe("unmatched")
  })
  it("exposes weaker candidates, missing marketplaces, currency mismatches and deferred links", () => {
    const candidate = {
      ...posting,
      orderId: null,
      currency: "CAD",
      data: {
        ...posting.data,
        marketplaceDetails: null,
        transactionStatus: "DEFERRED",
        relatedIdentifiers: [{ relatedIdentifierName: "RELEASE_TRANSACTION_ID", relatedIdentifierValue: "T2" }]
      }
    }
    expect(reconcileAmazonEvidence([row], inventory, [candidate])[0]?.finance.candidates[0]).toMatchObject({
      basis: "product_only",
      marketplaceId: null,
      status: "DEFERRED",
      currencyMatches: false,
      hasReleaseLink: true
    })
  })
  it("recognizes explicit ORDER_ID references without inventing removal or reimbursement reference types", () => {
    const candidate = {
      ...posting,
      orderId: null,
      data: { relatedIdentifiers: [{ relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "ORDER1" }] }
    }
    expect(reconcileAmazonEvidence([row], inventory, [candidate])[0]?.finance.candidates[0]?.basis).toBe(
      "order_reference"
    )
    expect(reconcileAmazonEvidence([{ ...row, orderId: null }], inventory, [candidate])[0]?.finance.status).toBe(
      "unmatched"
    )
  })
  it("compares exact signed decimals including values beyond safe integers without adding parent/child trees", () => {
    expect(postingEvidence(posting).totals).toEqual({ breakdowns: "balanced", items: "balanced" })
    const data = {
      totalAmount: money("9007199254740993.000001"),
      breakdowns: [{ breakdownAmount: money("9007199254740994") }, { breakdownAmount: money("-0.999999") }]
    }
    expect(postingEvidence({ ...posting, data }).totals.breakdowns).toBe("balanced")
    expect(
      postingEvidence({ ...posting, data: { ...data, totalAmount: money("9007199254740993.000002") } }).totals
        .breakdowns
    ).toBe("amount_mismatch")
  })
  it("reports missing or mixed-currency totals without treating them as zero", () => {
    expect(postingEvidence({ ...posting, data: {} }).totals).toEqual({
      breakdowns: "unavailable",
      items: "unavailable"
    })
    expect(
      postingEvidence({
        ...posting,
        data: { totalAmount: money("1"), breakdowns: [{ breakdownAmount: money("1", "CAD") }] }
      }).totals.breakdowns
    ).toBe("currency_mismatch")
    expect(
      postingEvidence({
        ...posting,
        data: { totalAmount: money("1"), breakdowns: [{ breakdownAmount: money("NaN") }] }
      }).totals.breakdowns
    ).toBe("unavailable")
  })
  it("reports candidate counts when response examples are capped", () => {
    const result = reconcileAmazonEvidence(
      [row],
      inventory,
      Array.from({ length: 25 }, (_, i) => ({ ...posting, transactionId: `T${i}` }))
    )[0]
    expect(result?.finance.candidateCount).toBe(25)
    expect(result?.finance.candidates).toHaveLength(20)
  })
})

it("explains financial match blockers without recognizing duplicate recovery or mistaking signed amounts", () => {
  const released = reconcileAmazonEvidence([row], inventory, [posting])[0]!.finance.candidates[0]!
  expect(released.checks).toMatchObject({
    signedSourceToTransactionTotal: "balanced",
    additionalRecognizedAmount: null
  })
  expect(released.checks.blockers).toEqual(["source_to_posting_allocation_required", "reversal_review_required"])
  const deferred = {
    ...posting,
    orderId: null,
    data: {
      ...posting.data,
      transactionStatus: "DEFERRED",
      relatedIdentifiers: [{ relatedIdentifierName: "RELEASE_TRANSACTION_ID", relatedIdentifierValue: "T2" }]
    }
  }
  const result = reconcileAmazonEvidence([{ ...row, amount: "-0.3" }], inventory, [deferred])[0]!.finance.candidates[0]!
  expect(result.checks.signedSourceToTransactionTotal).toBe("amount_mismatch")
  expect(result.checks.blockers).toEqual(
    expect.arrayContaining(["no_order_reference", "not_released", "deferred_release_requires_review"])
  )
  expect(
    reconcileAmazonEvidence([{ ...row, amount: null, currency: null }], inventory, [posting])[0]!.finance.candidates[0]!
      .checks.signedSourceToTransactionTotal
  ).toBe("unavailable")
})

it("prioritizes stronger payment candidates before candidate pagination without confirming payment", () => {
  const source = { ...row, source: "reimbursements" }
  const strong = { ...posting, type: "FBAInventoryReimbursement", transactionId: "strong" }
  const weak = Array.from({ length: 25 }, (_, i) => ({
    ...strong,
    transactionId: `weak-${i}`,
    data: { ...strong.data, items: [] }
  }))
  const result = reconcileAmazonEvidence([source], [], [...weak, strong])[0]!
  expect(result.finance.candidates[0]).toMatchObject({ transactionId: "strong", strongerPaymentCandidate: true })
  expect(result.finance.matching).toMatchObject({
    strongerPaymentCandidateCount: 1,
    scope: "current_posting_search_page",
    competingReportRows: "not_assessed_across_report_pages"
  })
  expect(result.finance.reconciled).toBe(false)
  expect(result.finance.candidates[0]?.checks.blockers).toContain("source_to_posting_allocation_required")
})
it.each([
  { orderId: null },
  { sku: null },
  { sku: "wrong" },
  { asin: "wrong" },
  { amount: "-0.3" },
  { currency: "EUR" }
])("does not promote incomplete or conflicting reimbursement evidence: %j", (change) => {
  const result = reconcileAmazonEvidence(
    [{ ...row, source: "reimbursements", ...change }],
    [],
    [{ ...posting, type: "FBAInventoryReimbursement" }]
  )[0]!
  expect(result.finance.matching.strongerPaymentCandidateCount).toBe(0)
})
it.each([
  { currency: "EUR" },
  { data: { ...posting.data, marketplaceDetails: {} } },
  { data: { ...posting.data, totalAmount: money("0.3", "EUR") } },
  { type: "Refund" }
])("requires matching saved and payload currency, marketplace and payment type: %j", (change) => {
  const result = reconcileAmazonEvidence(
    [{ ...row, source: "reimbursements" }],
    [],
    [{ ...posting, type: "FBAInventoryReimbursement", ...change }]
  )[0]!
  expect(result.finance.matching.strongerPaymentCandidateCount).toBe(0)
})

it("flags a payment shared by report rows across dates without counting duplicate context twice", () => {
  const current = { ...row, source: "reimbursements" }
  const other = { ...current, id: "other", occurredAt: "2025-01-01T00:00:00Z" }
  const payments = Array.from({ length: 21 }, (_, i) => ({
    ...posting,
    type: "FBAInventoryReimbursement",
    transactionId: `T${i}`
  }))
  const context = { rows: [current, other, other], truncated: false }
  const result = reconcileAmazonEvidence([current], [], payments, 1, context)[0]!
  expect(result.finance.candidates).toHaveLength(1)
  expect(result.finance.candidates[0]?.paymentCompetition).toMatchObject({
    status: "shared_candidate",
    otherReportRowCount: 1,
    otherReportRowIds: ["other"],
    countIsLowerBound: false,
    reportSearchTruncated: false,
    paymentAssignmentConfirmed: false
  })
  expect(result.finance.matching.sharedPaymentCandidateCount).toBe(21)
  expect(result.finance.reconciled).toBe(false)
})
it("does not claim uniqueness from a truncated report search, and bounds returned IDs", () => {
  const current = { ...row, source: "reimbursements" }
  const payment = { ...posting, type: "FBAInventoryReimbursement" }
  const context = { rows: Array.from({ length: 25 }, (_, i) => ({ ...current, id: `other-${i}` })), truncated: true }
  const shared = reconcileAmazonEvidence([current], [], [payment], 0, context)[0]!.finance.candidates[0]!
  expect(shared.paymentCompetition).toMatchObject({
    status: "shared_candidate",
    otherReportRowCount: 25,
    returnedIdsTruncated: true,
    countIsLowerBound: true
  })
  expect(shared.paymentCompetition?.otherReportRowIds).toHaveLength(20)
  const missing = reconcileAmazonEvidence([current], [], [payment], 0, { rows: [], truncated: true })[0]!.finance
    .candidates[0]!
  expect(missing.paymentCompetition).toMatchObject({
    status: "search_incomplete",
    otherReportRowCount: 0,
    countIsLowerBound: true
  })
})
it("uses the same strict identity and signed amount rules for competing reports", () => {
  const current = { ...row, source: "reimbursements" }
  const changes = [
    { orderId: "other" },
    { sku: "other" },
    { asin: "other" },
    { marketplaceId: "other" },
    { currency: "EUR" },
    { amount: "-0.3" },
    { sku: null }
  ]
  const context = { rows: changes.map((change, i) => ({ ...current, ...change, id: `other-${i}` })), truncated: false }
  const payment = {
    ...posting,
    orderId: null,
    type: "FBAInventoryReimbursement",
    data: {
      ...posting.data,
      relatedIdentifiers: [{ relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "ORDER1" }]
    }
  }
  const candidate = reconcileAmazonEvidence([current], [], [payment], 0, context)[0]!.finance.candidates[0]!
  expect(candidate.paymentCompetition).toMatchObject({
    status: "no_other_matching_stored_rows",
    otherReportRowCount: 0,
    paymentAssignmentConfirmed: false
  })
  const weak = reconcileAmazonEvidence([{ ...current, sku: null }], [], [payment], 0, context)[0]!.finance
    .candidates[0]!
  expect(weak.paymentCompetition).toBeNull()
})
