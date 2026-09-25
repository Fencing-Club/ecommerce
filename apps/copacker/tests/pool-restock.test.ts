import { describe, expect, it } from "vitest"
import { poolRestock } from "../src/server/pool-restock"

describe("location-specific restock", () => {
  it("uses Shopify available inventory without subtracting committed orders again", () => {
    const result = poolRestock({
      selection: { pool: "shopify", variantId: "v1", locationId: "local" },
      availability: { source: "shopify", available: 80, committed: 20, onHand: 100 },
      incoming: 0,
      caseQuantity: null,
      unitCostMinor: 500,
      stocked: true,
      unitsVerified: true,
      shopifySales: {
        rows: [
          {
            variantId: "v1",
            buyerSku: "SKU",
            locationId: "local",
            pool: "shopify",
            bundleVariantId: null,
            fulfilledUnits: 112
          }
        ],
        gaps: []
      },
      amazonSales: null,
      leadTimeDays: 56,
      salesWindowDays: 56
    })
    expect(result.stock).toMatchObject({ available: 80, allocated: 20 })
    expect(result.recommendation.purchaseUnits).toBe(32)
    expect(result.recommendation.estimatedCostMinor).toBe(16000)
  })
  it("blocks a recommendation when open demand has no proven Shopify location", () => {
    const result = poolRestock({
      selection: { pool: "shopify", variantId: "v1", locationId: "local" },
      availability: { source: "shopify", available: 80, committed: 20, onHand: 100 },
      incoming: 0,
      caseQuantity: null,
      unitCostMinor: 500,
      stocked: true,
      unitsVerified: true,
      shopifySales: {
        rows: [],
        gaps: [
          {
            sourceName: "web",
            locationId: null,
            orderId: "o1",
            variantId: "v1",
            buyerSku: "SKU",
            reason: "unfulfilled",
            units: 3
          }
        ]
      },
      amazonSales: null,
      leadTimeDays: 56,
      salesWindowDays: 56
    })
    expect(result.demand.reason).toBe("attribution_gap")
    expect(result.recommendation.purchaseUnits).toBeNull()
  })
})
