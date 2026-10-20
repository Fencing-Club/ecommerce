import { expect, it } from "vitest"
import { parseFbmReturns } from "../src/fbm-returns"
const report = (date: string, refund = "12.3456789", recovery = "Not Applicable") =>
  "Order ID\tReturn request date\tAmazon RMA ID\tMerchant SKU\tReturn quantity\tReturn Reason\tReturn request status\tRefunded Amount\tSafeT claim reimbursement amount\n" +
  `O1\t${date}\tR1\tS1\t1\tDEFECTIVE\tCLOSED\t${refund}\t${recovery}`
it.each(["9-Jun-2026", "09 June 2026", "2026/06/09", "2026-06-09"])(
  "reads an unambiguous day %s and preserves exact amounts",
  (date) => {
    expect(parseFbmReturns(report(date))[0]).toMatchObject({
      occurredAt: "2026-06-09T00:00:00Z",
      datePrecision: "day",
      refundedAmount: "12.3456789",
      recoveryAmount: null
    })
  }
)
it.each(["N/A", "Not Available", "Not Applicable", "--", "-", ""])("keeps unavailable amount %s unknown", (amount) => {
  expect(parseFbmReturns(report("2026-06-09", amount, amount))[0]).toMatchObject({
    refundedAmount: null,
    recoveryAmount: null
  })
})
it.each(["2026-06-09T10:30:15-0700", "2026-06-09 10:30:15-07:00"])(
  "retains the explicit timestamp offset %s",
  (date) => {
    expect(parseFbmReturns(report(date))[0]).toMatchObject({
      occurredAt: "2026-06-09T10:30:15-07:00",
      datePrecision: "timestamp"
    })
  }
)
it.each(["31-Feb-2026", "2026/02/31", "06/09/2026", "2026-06-09 10:30:15", "unknown"])(
  "rejects invalid or ambiguous date %s",
  (date) => {
    expect(() => parseFbmReturns(report(date))).toThrow("Invalid")
  }
)
it("keeps zero and signed recoveries distinct from unavailable or malformed amounts", () => {
  expect(parseFbmReturns(report("2026-06-09", "0", "-2.00001"))[0]).toMatchObject({
    refundedAmount: "0",
    recoveryAmount: "-2.00001"
  })
  expect(() => parseFbmReturns(report("2026-06-09", "unknown"))).toThrow("Invalid")
  expect(() => parseFbmReturns(report("2026-06-09", "12 USD"))).toThrow("Invalid")
})
