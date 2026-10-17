import { describe, expect, it } from "vitest"
import { parseMonthlyStorageFees, parseAgedStorageFees } from "../src/storage-fees"
function report(row: Record<string, string>) {
  return [Object.keys(row).join("\t"), Object.values(row).join("\t")].join("\n")
}
const monthly = {
  asin: "A1",
  fnsku: "FN1",
  fulfillment_center: "FC1",
  country_code: "US",
  month_of_charge: "2026-09",
  currency: "USD",
  estimated_monthly_storage_fee: "9007199254740993.123456789",
  average_quantity_on_hand: "2.75"
}
const aged = {
  "snapshot-date": "09/15/2026",
  sku: "SKU1",
  fnsku: "FN1",
  asin: "A1",
  currency: "USD",
  country: "US",
  "qty-charged": "9007199254740993",
  "amount-charged": "-0.123456789"
}
describe("Amazon storage fee reports", () => {
  it.each([
    ["8.0E-4", "0.00080"],
    ["-1.234567890123456789e+2", "-123.4567890123456789"],
    ["1e3", "1000"],
    ["1E-9", "0.000000001"]
  ])("expands Amazon scientific notation %s without losing digits", (amount, expected) => {
    const [row] = parseMonthlyStorageFees(report({ ...monthly, estimated_monthly_storage_fee: amount }))
    expect(row?.amount).toBe(expected)
    expect(row?.data.estimated_monthly_storage_fee).toBe(amount)
  })
  it("preserves exact estimates, fractional averages and raw components without guessing SKU or adding costs", () => {
    const [row] = parseMonthlyStorageFees(
      report({
        ...monthly,
        est_base_msf: "10.000001",
        est_sus: "2.000002",
        total_incentive_fee_amount: "-1",
        product_name: "Title"
      })
    )
    expect(row).toMatchObject({
      periodDay: "2026-09-01",
      sku: null,
      amount: monthly.estimated_monthly_storage_fee,
      quantity: "2.75",
      volume: null,
      rate: null,
      ageTier: null,
      data: { est_base_msf: "10.000001", est_sus: "2.000002", total_incentive_fee_amount: "-1" }
    })
    expect(row?.data).not.toHaveProperty("product_name")
  })
  it("preserves signed charges, large quantities and unknown age tiers without inventing a fulfillment center", () => {
    expect(parseAgedStorageFees(report({ ...aged, "surcharge-age-tier": "NEW_TIER" }))[0]).toMatchObject({
      periodDay: "2026-09-15",
      amount: "-0.123456789",
      quantity: "9007199254740993",
      ageTier: "NEW_TIER",
      fulfillmentCenterId: null
    })
    expect(parseAgedStorageFees(report({ ...aged, "snapshot-date": "2024-02-29" }))[0]?.periodDay).toBe("2024-02-29")
  })
  it("distinguishes missing values from zero and preserves duplicate source rows", () => {
    expect(
      parseMonthlyStorageFees(
        report({ ...monthly, estimated_monthly_storage_fee: "", average_quantity_on_hand: "0", currency: "" })
      )[0]
    ).toMatchObject({ amount: null, quantity: "0", currency: null })
    const text = report(aged)
    expect(parseAgedStorageFees(text + "\n" + text.split("\n")[1])).toHaveLength(2)
  })
  it.each<Record<string, string>>([
    { month_of_charge: "2026-13" },
    { month_of_charge: "09/2026" },
    { estimated_monthly_storage_fee: "1,000" },
    { currency: "usd" },
    { average_quantity_on_hand: "NaN" },
    { estimated_monthly_storage_fee: "1e999999" },
    { estimated_monthly_storage_fee: "1e" }
  ])("rejects malformed monthly values %j", (override) => {
    expect(() => parseMonthlyStorageFees(report({ ...monthly, ...override }))).toThrow(/./)
  })
  it.each<Record<string, string>>([
    { "snapshot-date": "02/29/2026" },
    { "snapshot-date": "2026-09-15T00:00:00Z" },
    { "qty-charged": "1.5" },
    { "amount-charged": "Infinity" }
  ])("rejects malformed assessed values %j", (override) => {
    expect(() => parseAgedStorageFees(report({ ...aged, ...override }))).toThrow(/./)
  })
  it("accepts header-only documents but rejects missing required headers", () => {
    expect(parseMonthlyStorageFees(Object.keys(monthly).join("\t"))).toEqual([])
    expect(parseAgedStorageFees(Object.keys(aged).join("\t"))).toEqual([])
    expect(() => parseMonthlyStorageFees("asin\nA1")).toThrow(/./)
    expect(() => parseAgedStorageFees("sku\nSKU1")).toThrow(/./)
  })
})
