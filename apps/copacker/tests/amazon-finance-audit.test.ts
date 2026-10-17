import { describe, expect, it } from "vitest"
import { amazonFinanceAudit } from "../src/server/amazon-finance-audit"

const money = (currencyAmount: number | string, currencyCode = "USD") => ({ currencyAmount, currencyCode })
const part = (breakdownType: string, currencyAmount: number) => ({
  breakdownType,
  breakdownAmount: money(currencyAmount)
})
function row(transactionId = "t1", data: Record<string, unknown> = {}) {
  return {
    transactionId,
    orderId: "order1",
    postedAt: "2026-10-01T10:00:00Z",
    type: "Shipment",
    currency: "USD",
    totalMinor: 800,
    feesMinor: 200,
    hasStoredOrder: true,
    data: { totalAmount: money(8), breakdowns: [part("Sales", 10), part("AmazonFees", -2)], ...data }
  }
}

describe("Amazon financial evidence audit", () => {
  it("inventories nested paths without treating parents and children as additive costs", () => {
    const audit = amazonFinanceAudit()
    audit.inspect(
      row("t1", {
        breakdowns: [part("Sales", 10), { ...part("AmazonFees", -2), breakdowns: [part("Commission", -2)] }],
        items: [
          {
            contexts: [{ sku: "SKU1" }],
            breakdowns: [part("Commission", -2)],
            relatedIdentifiers: [
              { itemRelatedIdentifierName: "ORDER_ADJUSTMENT_ITEM_ID", itemRelatedIdentifierValue: "adjustment1" }
            ]
          }
        ]
      })
    )
    const report = audit.report()
    expect(report.transactions[0]?.signedMinor).toBe(800)
    expect(report.identifiers).toContainEqual({ key: ["item", "ORDER_ADJUSTMENT_ITEM_ID"], count: 1, signedMinor: 0 })
    expect(report.breakdowns).toContainEqual({
      key: ["USD", "transaction", "AmazonFees", "Commission"],
      count: 1,
      signedMinor: -200
    })
    expect(report.issues.map((issue) => issue.name)).not.toContain("topLevelBreakdownDiffersFromTotal")
    expect(report.issues.map((issue) => issue.name)).not.toContain("noItemSkuOrAsin")
  })

  it("keeps currencies, statuses and deferred releases separate, and reports missing stored orders", () => {
    const audit = amazonFinanceAudit()
    audit.inspect(row())
    audit.inspect({
      ...row("t2"),
      currency: "CAD",
      hasStoredOrder: false,
      data: {
        totalAmount: money(8, "CAD"),
        transactionStatus: "RELEASED",
        relatedIdentifiers: [{ relatedIdentifierName: "DEFERRED_TRANSACTION_ID", relatedIdentifierValue: "t1" }]
      }
    })
    expect(audit.report().transactions).toHaveLength(2)
    expect(audit.report().identifiers).toEqual([
      { key: ["transaction", "DEFERRED_TRANSACTION_ID"], count: 1, signedMinor: 0 }
    ])
    expect(audit.report().issues).toEqual(
      expect.arrayContaining([
        { name: "orderNotInStoredSales", count: 1, examples: ["t2"] },
        { name: "deferredReleasePresent", count: 1, examples: ["t2"] }
      ])
    )
  })

  it("flags missing and malformed evidence without inventing zero-valued reconciliation", () => {
    const audit = amazonFinanceAudit()
    audit.inspect(
      row("bad", {
        totalAmount: money(""),
        breakdowns: [part("Sales", 10), { breakdownType: "Fee", breakdownAmount: money("bad") }]
      })
    )
    const names = audit.report().issues.map((issue) => issue.name)
    expect(names).toContain("missingOrInvalidPayloadTotal")
    expect(names).toContain("topLevelReconciliationUnavailable")
    expect(names).not.toContain("topLevelBreakdownDiffersFromTotal")
  })

  it("reports discrepancies in stored totals and same-currency root breakdowns", () => {
    const audit = amazonFinanceAudit()
    audit.inspect(row("bad", { totalAmount: money(9), breakdowns: [part("Sales", 10)] }))
    expect(audit.report().issues.map((issue) => issue.name)).toEqual(
      expect.arrayContaining(["storedTotalDiffersFromPayload", "topLevelBreakdownDiffersFromTotal"])
    )
  })

  it("limits examples while counting every affected transaction and normalizes observed dates", () => {
    const audit = amazonFinanceAudit()
    for (let index = 0; index < 8; index++) {
      audit.inspect({ ...row(`t${index}`), orderId: null, hasStoredOrder: null })
    }
    expect(audit.report().issues.find((issue) => issue.name === "noOrderReference")).toEqual({
      name: "noOrderReference",
      count: 8,
      examples: ["t0", "t1", "t2", "t3", "t4"]
    })
    expect(audit.report().observedPostingRange).toEqual({
      first: "2026-10-01T10:00:00.000Z",
      last: "2026-10-01T10:00:00.000Z"
    })
    expect(amazonFinanceAudit().report().observedPostingRange).toEqual({ first: null, last: null })
  })

  it("rejects invalid stored rows instead of publishing an apparently complete audit", () => {
    expect(() => amazonFinanceAudit().inspect({ ...row(), totalMinor: 1.5 })).toThrow("Invalid input")
  })
})
