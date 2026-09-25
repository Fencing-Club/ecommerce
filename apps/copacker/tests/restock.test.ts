import { describe, expect, it } from "vitest"
import { restockRecommendation } from "../src/server/restock"
const input = {
  available: 20,
  verifiedIncoming: 10,
  soldUnits: 56,
  caseQuantity: null,
  unitCostMinor: 2143,
  stocked: true,
  unitsVerified: true
}
describe("lead-time-only restock recommendations", () => {
  it("covers only lead time, subtracts incoming once and estimates minor-unit cost", () => {
    expect(restockRecommendation(input, {})).toMatchObject({
      unitsPerDay: 1,
      daysRemaining: 20,
      stockoutBeforeArrival: true,
      purchaseUnits: 26,
      estimatedCostMinor: 55718
    })
  })
  it("rounds to whole cases and supports explicit incoming exclusion", () => {
    expect(restockRecommendation({ ...input, caseQuantity: 6 }, {})).toMatchObject({ purchaseUnits: 30, caseCount: 5 })
    expect(restockRecommendation(input, { includeIncoming: false })).toMatchObject({ purchaseUnits: 36 })
  })
  it("does not manufacture zero stock or demand from missing inputs", () => {
    expect(restockRecommendation({ ...input, soldUnits: null }, {})).toMatchObject({
      purchaseUnits: null,
      daysRemaining: null,
      demandState: "unknown"
    })
    expect(restockRecommendation({ ...input, available: null }, {})).toMatchObject({
      purchaseUnits: null,
      outOfStock: null
    })
    expect(restockRecommendation({ ...input, verifiedIncoming: null }, {})).toMatchObject({
      purchaseUnits: null,
      blocked: ["incoming_unknown"]
    })
    expect(restockRecommendation({ ...input, unitsVerified: false }, {})).toMatchObject({ purchaseUnits: null })
  })
  it("distinguishes no observed sales from missing demand and preserves backorders", () => {
    expect(restockRecommendation({ ...input, soldUnits: 0 }, {})).toMatchObject({
      purchaseUnits: 0,
      daysRemaining: null,
      demandState: "no_sales"
    })
    expect(restockRecommendation({ ...input, available: -5 }, {})).toMatchObject({
      purchaseUnits: 51,
      daysRemaining: 0,
      outOfStock: true
    })
  })
  it("respects a disabled stocking target and missing prices", () => {
    expect(restockRecommendation({ ...input, stocked: false }, {})).toMatchObject({
      purchaseUnits: 0,
      estimatedCostMinor: 0
    })
    expect(restockRecommendation({ ...input, unitCostMinor: null }, {})).toMatchObject({
      purchaseUnits: 26,
      estimatedCostMinor: null
    })
  })
  it("changes demand coverage when the buyer adjusts lead time and sales window", () => {
    expect(restockRecommendation(input, { leadTimeDays: 28, salesWindowDays: 56 })).toMatchObject({ purchaseUnits: 0 })
    expect(restockRecommendation(input, { leadTimeDays: 28, salesWindowDays: 28 })).toMatchObject({ purchaseUnits: 26 })
  })
  it("does not add a case because of floating-point demand rounding", () => {
    expect(
      restockRecommendation(
        { ...input, available: 0, verifiedIncoming: 0, soldUnits: 29, caseQuantity: 29 },
        { leadTimeDays: 100, salesWindowDays: 100 }
      )
    ).toMatchObject({ purchaseUnits: 29, caseCount: 1 })
    expect(
      restockRecommendation(
        { ...input, available: 0, verifiedIncoming: 0, soldUnits: 1, caseQuantity: 6 },
        { leadTimeDays: 1, salesWindowDays: 3 }
      )
    ).toMatchObject({ purchaseUnits: 6, caseCount: 1 })
  })
  it("rejects unsafe totals and invalid case quantities", () => {
    expect(() => restockRecommendation({ ...input, caseQuantity: 0 }, {})).toThrow("caseQuantity")
    expect(() => restockRecommendation({ ...input, unitCostMinor: Number.MAX_SAFE_INTEGER }, {})).toThrow(
      "cost exceeds"
    )
  })
})

describe("stock target and minimum order", () => {
  const base = {
    available: 32,
    verifiedIncoming: 17,
    soldUnits: 2,
    caseQuantity: null,
    unitCostMinor: null,
    stocked: true,
    unitsVerified: true
  }
  const settings = { leadTimeDays: 28, salesWindowDays: 28 }

  it("tops up to the target plus lead-time demand, matching Aisle's anchor case", () => {
    expect(restockRecommendation({ ...base, targetStock: 50 }, settings).purchaseUnits).toBe(3)
  })

  it("raises a need to the minimum order, then rounds to whole cases", () => {
    expect(restockRecommendation({ ...base, targetStock: 50, minimumOrder: 10 }, settings).purchaseUnits).toBe(10)
    expect(
      restockRecommendation({ ...base, targetStock: 50, minimumOrder: 10, caseQuantity: 4 }, settings).purchaseUnits
    ).toBe(12)
    // No need means no order, whatever the minimum.
    expect(restockRecommendation({ ...base, minimumOrder: 10 }, settings).purchaseUnits).toBe(0)
  })
})
