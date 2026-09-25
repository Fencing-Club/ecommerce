import { describe, expect, it } from "vitest"
import { restockRecommendation } from "../src/server/restock"
import { restockAvailability } from "../src/server/restock-availability"

describe("provider availability for restock", () => {
  it.each([
    { source: "shopify", available: 80, committed: 20, onHand: 100 },
    { source: "fba", fulfillableQuantity: 80, pendingCustomerOrderQuantity: 20, totalQuantity: 100 },
    { source: "awd", availableDistributable: 80, reservedDistributable: 20, onHand: 100 }
  ])("does not deduct allocated stock twice for $source", (snapshot) => {
    const result = restockAvailability(snapshot)
    expect(result).toMatchObject({ available: 80, allocated: 20 })
    expect(
      restockRecommendation(
        {
          available: result.available,
          verifiedIncoming: 0,
          soldUnits: 112,
          caseQuantity: null,
          unitCostMinor: 100,
          stocked: true,
          unitsVerified: true
        },
        { leadTimeDays: 56, salesWindowDays: 56 }
      )
    ).toMatchObject({ purchaseUnits: 32, daysRemaining: 40 })
  })
  it("does not replace unknown sellable stock with physical or total stock", () => {
    expect(restockAvailability({ source: "shopify", available: null, committed: 20, onHand: 100 }).available).toBeNull()
    expect(
      restockAvailability({
        source: "fba",
        fulfillableQuantity: null,
        pendingCustomerOrderQuantity: 20,
        totalQuantity: 100
      }).available
    ).toBeNull()
    expect(
      restockAvailability({ source: "awd", availableDistributable: null, reservedDistributable: 20, onHand: 100 })
        .available
    ).toBeNull()
  })
  it("preserves negative Shopify availability for oversold stock", () => {
    expect(restockAvailability({ source: "shopify", available: -5, committed: 5, onHand: 0 }).available).toBe(-5)
  })
  it("does not require allocation data to use known provider availability", () => {
    expect(
      restockAvailability({
        source: "fba",
        fulfillableQuantity: 80,
        pendingCustomerOrderQuantity: null,
        totalQuantity: null
      })
    ).toMatchObject({ available: 80, allocated: null })
  })
})
