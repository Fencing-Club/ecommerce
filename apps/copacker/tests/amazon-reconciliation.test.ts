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
describe("Amazon reconciliation evidence", () => {
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
