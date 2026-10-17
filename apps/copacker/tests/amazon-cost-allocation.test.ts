import { describe, expect, it } from "vitest"
import { allocateAmazonPosting } from "../src/server/amazon-cost-allocation"
import { type HistoricalProductMapping, historicalProductMatch } from "../src/server/amazon-product-mappings"
import type { ReconciliationPosting } from "../src/server/amazon-reconciliation"
const mapping: HistoricalProductMapping = {
  id: "map1",
  orgId: "org",
  externalAccountId: "seller",
  marketplaceId: "US",
  sku: "SKU1",
  asin: "A1",
  fnsku: null,
  shopifyDomain: "store",
  variantId: "v1",
  validFrom: new Date("2026-01-01"),
  validTo: new Date("2027-01-01"),
  evidence: "Invoice",
  createdBy: "user",
  createdAt: new Date("2026-10-01"),
  retiredAt: null,
  retiredBy: null,
  supersedes: null
}
const money = (value: string, currency = "USD") => ({ currencyAmount: value, currencyCode: currency })
const part = (breakdownType: string, value: string) => ({ breakdownType, breakdownAmount: money(value) })
const item = (sku: string, asin: string, net: string, sales: string, fee: string) => ({
  totalAmount: money(net),
  contexts: [{ contextType: "ProductContext", sku, asin }],
  breakdowns: [part("Sales", sales), { ...part("AmazonFees", fee), breakdowns: [part("Commission", fee)] }]
})
const posting: ReconciliationPosting = {
  transactionId: "T1",
  orderId: "O1",
  postedAt: new Date("2026-10-01"),
  type: "Shipment",
  currency: "USD",
  data: {
    transactionStatus: "RELEASED",
    marketplaceDetails: { marketplaceId: "US" },
    totalAmount: money("26"),
    items: [item("SKU1", "A1", "8", "10", "-2"), item("SKU2", "A2", "18", "20", "-2")],
    breakdowns: [part("Sales", "30"), { ...part("AmazonFees", "-4"), breakdowns: [part("Commission", "-4")] }]
  }
}
describe("historical allocation", () => {
  it("allocates direct item net and fees once while preserving the exact unallocated remainder", () => {
    const result = allocateAmazonPosting(posting, [mapping])
    expect(result).toMatchObject({
      status: "item_totals_reconciled",
      total: "26",
      allocatedNet: "8",
      unallocatedNet: "18",
      recognizedFees: "-4",
      allocatedFees: "-2",
      unallocatedFees: "-2",
      feeCheck: "balanced"
    })
    expect(result.allocations).toMatchObject([
      { itemIndex: 0, status: "allocated", net: "8", fee: "-2", mapping: { id: "map1", variantId: "v1" } },
      { itemIndex: 1, status: "unallocated", net: "18", fee: "-2", mapping: null }
    ])
  })
  it("respects effective dates and corrections without treating current identity as history", () => {
    const row = { sku: "SKU1", asin: "A1", fnsku: null, marketplaceId: "US", occurredAt: "2026-07-01T00:00:00Z" }
    const before = { ...mapping, validTo: new Date("2026-07-01") }
    const after = { ...mapping, id: "map2", variantId: "v2", validFrom: new Date("2026-07-01") }
    expect(historicalProductMatch(row, [before, after])).toMatchObject({
      status: "confirmed",
      candidates: [{ id: "map2" }]
    })
    expect(historicalProductMatch({ ...row, occurredAt: "2025-12-31T23:59:59Z" }, [before, after]).status).toBe(
      "unmapped"
    )
    expect(historicalProductMatch(row, [{ ...after, retiredAt: new Date() }]).status).toBe("unmapped")
    expect(
      historicalProductMatch({ ...row, sku: null, fnsku: null }, [
        mapping,
        { ...mapping, id: "map2", sku: "SKU2", variantId: "v2" }
      ]).status
    ).toBe("ambiguous")
  })
  it("does not confirm ASIN-only evidence from a partially populated mapping registry", () => {
    expect(
      historicalProductMatch(
        { sku: null, asin: "A1", fnsku: null, marketplaceId: "US", occurredAt: "2026-10-01T00:00:00Z" },
        [mapping]
      ).status
    ).toBe("insufficient_identifiers")
    expect(
      historicalProductMatch(
        { sku: null, asin: "A1", fnsku: "FN1", marketplaceId: "US", occurredAt: "2026-10-01T00:00:00Z" },
        [{ ...mapping, fnsku: "FN1" }]
      ).status
    ).toBe("confirmed")
  })
  it("holds deferred releases, transfers and inconsistent totals for review", () => {
    for (const change of [
      { ...posting, data: { ...posting.data, transactionStatus: "DEFERRED" } },
      { ...posting, type: "Transfer" },
      {
        ...posting,
        data: {
          ...posting.data,
          relatedIdentifiers: [{ relatedIdentifierName: "DEFERRED_TRANSACTION_ID", relatedIdentifierValue: "old" }]
        }
      },
      { ...posting, data: { ...posting.data, totalAmount: money("27") } },
      { ...posting, currency: "CAD" },
      { ...posting, data: { ...posting.data, marketplaceDetails: null } },
      { ...posting, data: { ...posting.data, sellingPartnerMetadata: { marketplaceId: "OTHER" } } }
    ]) {
      const result = allocateAmazonPosting(change, [mapping])
      expect(result.status).toBe("unallocated")
      expect(result.allocations).toEqual([])
      expect(result.allocatedNet).toBe("0")
      expect(result.recognizedFees).toBeNull()
    }
  })
  it("supports the metadata marketplace field and retains reversal signs", () => {
    const reversed = {
      ...posting,
      type: "Refund",
      data: {
        transactionStatus: "RELEASED",
        sellingPartnerMetadata: { marketplaceId: "US" },
        totalAmount: money("-8"),
        items: [item("SKU1", "A1", "-8", "-10", "2")],
        breakdowns: [part("Sales", "-10"), part("AmazonFees", "2")]
      }
    }
    expect(allocateAmazonPosting(reversed, [mapping])).toMatchObject({
      allocatedNet: "-8",
      allocatedFees: "2",
      unallocatedNet: "0"
    })
  })
  it("does not confirm fee allocations when item and transaction fee totals disagree or children do not balance", () => {
    const invalid = {
      ...posting,
      data: { ...posting.data, breakdowns: [part("Sales", "29"), part("AmazonFees", "-3")] }
    }
    expect(allocateAmazonPosting(invalid, [mapping])).toMatchObject({
      feeCheck: "unavailable",
      recognizedFees: null,
      allocatedFees: null
    })
    const invalidChild = {
      ...posting,
      data: {
        ...posting.data,
        breakdowns: [part("Sales", "30"), { ...part("AmazonFees", "-4"), breakdowns: [part("Commission", "-3")] }]
      }
    }
    expect(allocateAmazonPosting(invalidChild, [mapping]).feeCheck).toBe("unavailable")
  })
  it("requires item breakdown roots to equal their item total before confirming fees", () => {
    const inconsistent = { ...posting, data: { ...posting.data, items: [item("SKU1", "A1", "26", "31", "-4")] } }
    expect(allocateAmazonPosting(inconsistent, [mapping])).toMatchObject({
      recognizedFees: null,
      allocatedFees: null,
      feeCheck: "unavailable"
    })
  })
  it("leaves ambiguous or contradictory products unallocated", () => {
    expect(allocateAmazonPosting(posting, [{ ...mapping, asin: "WRONG" }]).allocatedNet).toBe("0")
    expect(allocateAmazonPosting(posting, [mapping, { ...mapping, id: "map2", variantId: "v2" }]).allocatedNet).toBe(
      "0"
    )
    const ambiguous = {
      ...posting,
      data: {
        ...posting.data,
        items: [
          {
            ...item("SKU1", "A1", "26", "30", "-4"),
            contexts: [
              { contextType: "ProductContext", sku: "SKU1", asin: "A1" },
              { contextType: "ProductContext", sku: "SKU2", asin: "A2" }
            ]
          }
        ]
      }
    }
    expect(allocateAmazonPosting(ambiguous, [mapping]).allocatedNet).toBe("0")
  })
  it("retains sub-cent precision and rejects absent evidence rather than allocating zero costs", () => {
    const exact = {
      ...posting,
      data: {
        ...posting.data,
        totalAmount: money("0.000001"),
        items: [item("SKU1", "A1", "0.000001", "1", "-0.999999")],
        breakdowns: [part("Sales", "1"), part("AmazonFees", "-0.999999")]
      }
    }
    expect(allocateAmazonPosting(exact, [mapping])).toMatchObject({
      allocatedNet: "0.000001",
      allocatedFees: "-0.999999",
      unallocatedNet: "0.000000"
    })
    expect(allocateAmazonPosting({ ...posting, data: {} }, [mapping])).toMatchObject({
      reason: "invalid_total",
      total: null,
      unallocatedNet: null,
      recognizedFees: null
    })
  })
})
