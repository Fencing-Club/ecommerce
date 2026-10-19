import { expect, it } from "vitest"
import { amazonPostingDetail } from "../src/server/amazon-posting-detail"
const money = (value: string, currency = "USD") => ({ currencyCode: currency, currencyAmount: value })
const posting = {
  transactionId: "T",
  orderId: null,
  postedAt: new Date("2026-01-01"),
  type: "ServiceFee",
  currency: "USD",
  data: {
    totalAmount: money("-12.50"),
    breakdowns: [
      {
        breakdownType: "AmazonFees",
        breakdownAmount: money("-12.50"),
        breakdowns: [
          { breakdownType: "StorageFee", breakdownAmount: money("-10") },
          { breakdownType: "OtherFee", breakdownAmount: money("-2.50") }
        ]
      }
    ]
  }
}
it("returns signed leaves once and never sums parent fees with their children", () => {
  const result = amazonPostingDetail(posting)
  expect(result.componentCheck).toBe("balanced")
  expect(result.components).toEqual([
    { path: ["AmazonFees", "StorageFee"], amount: "-10", currency: "USD" },
    { path: ["AmazonFees", "OtherFee"], amount: "-2.50", currency: "USD" }
  ])
})
it("withholds partial component totals for inconsistent or cross-currency trees", () => {
  expect(amazonPostingDetail({ ...posting, data: { ...posting.data, totalAmount: money("-11") } })).toMatchObject({
    componentCheck: "unavailable",
    components: []
  })
  expect(
    amazonPostingDetail({ ...posting, data: { ...posting.data, totalAmount: money("-12.50", "CAD") } })
  ).toMatchObject({ componentCheck: "unavailable", components: [] })
})
