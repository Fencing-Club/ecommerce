import { expect, it } from "vitest"
import { amazonPostingAccounting } from "../src/server/amazon-posting-accounting"
import type { ReconciliationPosting } from "../src/server/amazon-reconciliation"
const money = (amount = "20.45") => ({ currencyCode: "USD", currencyAmount: amount })
const posting = (id: string, status: string, link?: { name: string; id: string }): ReconciliationPosting => ({
  transactionId: id,
  type: "FBAInventoryReimbursement",
  currency: "USD",
  orderId: null,
  postedAt: new Date("2026-09-01"),
  data: {
    transactionStatus: status,
    totalAmount: money(),
    marketplaceDetails: { marketplaceId: "US" },
    breakdowns: [{ breakdownAmount: money() }],
    relatedIdentifiers: link ? [{ relatedIdentifierName: link.name, relatedIdentifierValue: link.id }] : []
  }
})
it("counts a released posting once and excludes its original deferred copy across dates", () => {
  const original = posting("D", "DEFERRED_RELEASED", { name: "RELEASE_TRANSACTION_ID", id: "R" })
  const released = posting("R", "RELEASED", { name: "DEFERRED_TRANSACTION_ID", id: "D" })
  const rows = [original, released]
  expect(amazonPostingAccounting(original, rows, false)).toMatchObject({
    status: "excluded_deferred_copy",
    releasedPostingAmount: null
  })
  expect(amazonPostingAccounting(released, rows, false)).toMatchObject({
    status: "included_released_posting",
    countingKey: "R",
    releasedPostingAmount: { amount: "20.45", currency: "USD" }
  })
})
it("supports a one-sided explicit reference but blocks multiple releases and mismatches", () => {
  const d = posting("D", "DEFERRED_RELEASED"),
    r = posting("R", "RELEASED", { name: "DEFERRED_TRANSACTION_ID", id: "D" })
  expect(amazonPostingAccounting(r, [d, r], false).status).toBe("included_released_posting")
  expect(
    amazonPostingAccounting(r, [d, r, posting("R2", "RELEASED", { name: "DEFERRED_TRANSACTION_ID", id: "D" })], false)
      .blockers
  ).toContain("ambiguous_release_chain")
  expect(amazonPostingAccounting(r, [r, { ...d, currency: "CAD" }], false).blockers).toContain(
    "release_evidence_mismatch"
  )
})
it("keeps missing links, deferred events, malformed totals and unknown statuses out of released contributions", () => {
  const orphan = posting("D", "DEFERRED_RELEASED")
  expect(amazonPostingAccounting(orphan, [orphan], false).blockers).toContain("missing_release_reference")
  const d = posting("D", "DEFERRED")
  expect(amazonPostingAccounting(d, [d], false)).toMatchObject({ status: "deferred", releasedPostingAmount: null })
  for (const [row, truncated] of [
    [posting("R", "RELEASED"), true],
    [posting("R", "FUTURE"), false],
    [posting("R", "RELEASED", { name: "DEFERRED_TRANSACTION_ID", id: "missing" }), false]
  ] as const) {
    expect(amazonPostingAccounting(row, [row], truncated).releasedPostingAmount).toBeNull()
  }
})

it("uses database-proven shared identifiers for both sides without inventing release references", () => {
  const d = posting("D", "DEFERRED_RELEASED"),
    r = posting("R", "RELEASED")
  const pairs = [{ originalId: "D", releasedId: "R" }]
  expect(amazonPostingAccounting(d, [d, r], false, pairs)).toMatchObject({
    status: "excluded_deferred_copy",
    linkedTransactionIds: ["R"],
    linkBasis: "unique_shared_shipment_or_refund_id"
  })
  expect(amazonPostingAccounting(r, [d, r], false, pairs)).toMatchObject({
    status: "included_released_posting",
    countingKey: "R",
    linkedTransactionIds: ["D"]
  })
  expect(amazonPostingAccounting(r, [d, r], true, pairs).releasedPostingAmount).toBeNull()
})
