import { describe, expect, it } from "vitest"
import {
  automaticClassification,
  classifyShopifyStock,
  locationClassifications,
  locationMappingSchema
} from "../src/server/inventory-locations"

const orgId = "10000000-0000-4000-8000-000000000001"
const shopifyDomain = "test.myshopify.com"
const id = (n: number) => `gid://shopify/Location/${n}`
const level = (n: number, available: number | null) => ({
  locationId: id(n),
  locationName: "Same name",
  available,
  onHand: available,
  incoming: available,
  committed: 0
})
const stock = (levels = [level(1, 10), level(2, 100)]) => ({
  source: "shopify" as const,
  scopeKey: "store" as const,
  shopifyDomain,
  startedAt: "2026-09-25T17:00:00Z",
  observedAt: "2026-09-25T17:01:00Z",
  rows: [
    {
      variantId: "v1",
      inventoryItemId: "i1",
      buyerSku: "cord",
      productId: "p1",
      productTitle: "Cord",
      variantTitle: "Default Title",
      imageUrl: null,
      tracked: true,
      unit: "shopify_inventory_unit" as const,
      levels
    }
  ]
})
const mapping = (n: number, classification: "merchant" | "amazon_mirror" | "excluded" | "unresolved") =>
  locationMappingSchema.parse({ orgId, shopifyDomain, locationId: id(n), classification })

describe("Shopify inventory location classification", () => {
  it("excludes mirrored Amazon stock and incoming without discarding observations", () => {
    const result = classifyShopifyStock(orgId, stock(), [mapping(1, "merchant"), mapping(2, "amazon_mirror")])
    expect(result.rows[0]?.merchant).toEqual({ available: 10, onHand: 10, incoming: 10, committed: 0 })
    expect(result.rows[0]?.levels[1]).toMatchObject({ available: 100, classification: "amazon_mirror" })
  })
  it("blocks totals for unresolved locations and never guesses from location names", () => {
    const result = classifyShopifyStock(orgId, stock(), [mapping(1, "merchant")])
    expect(result.rows[0]?.merchant.available).toBeNull()
    expect(result.rows[0]?.hasUnresolvedLocations).toBe(true)
    expect(result.rows[0]?.levels[1]?.classification).toBe("unresolved")
  })
  it("adds only explicitly selected merchant locations and preserves negative and unknown states", () => {
    const mappings = [mapping(1, "merchant"), mapping(2, "merchant"), mapping(3, "excluded")]
    expect(
      classifyShopifyStock(orgId, stock([level(1, -2), level(2, 5), level(3, 500)]), mappings).rows[0]?.merchant
        .available
    ).toBe(3)
    expect(
      classifyShopifyStock(orgId, stock([level(1, null), level(2, 5)]), mappings).rows[0]?.merchant.available
    ).toBeNull()
  })
  it("does not imply zero stock for untracked, absent or entirely excluded inventory", () => {
    const untracked = stock()
    untracked.rows[0]!.tracked = false
    expect(
      classifyShopifyStock(orgId, untracked, [mapping(1, "merchant"), mapping(2, "merchant")]).rows[0]?.merchant
        .available
    ).toBeNull()
    expect(classifyShopifyStock(orgId, stock([]), [mapping(1, "merchant")]).unobservedLocationIds).toEqual([id(1)])
    expect(
      classifyShopifyStock(orgId, stock(), [mapping(1, "excluded"), mapping(2, "amazon_mirror")]).rows[0]?.merchant
        .available
    ).toBeNull()
  })
  it("rejects cross-tenant, replaced-store and duplicate mappings", () => {
    expect(() => classifyShopifyStock("other", stock(), [mapping(1, "merchant")])).toThrow("different workspace")
    expect(() =>
      classifyShopifyStock(orgId, { ...stock(), shopifyDomain: "replacement.myshopify.com" }, [mapping(1, "merchant")])
    ).toThrow("different workspace")
    expect(() => classifyShopifyStock(orgId, stock(), [mapping(1, "merchant"), mapping(1, "excluded")])).toThrow(
      "Duplicate"
    )
  })
  it("rejects unsafe totals", () => {
    expect(() =>
      classifyShopifyStock(orgId, stock([level(1, Number.MAX_SAFE_INTEGER), level(2, 1)]), [
        mapping(1, "merchant"),
        mapping(2, "merchant")
      ])
    ).toThrow("supported range")
  })
})

describe("effective location classification", () => {
  const stock = {
    rows: [
      {
        levels: [
          { locationId: "gid://shopify/Location/1", locationKind: "merchant" as const },
          { locationId: "gid://shopify/Location/2", locationKind: "amazon_fulfillment" as const },
          { locationId: "gid://shopify/Location/3", locationKind: "shopify_collective" as const },
          { locationId: "gid://shopify/Location/4", locationKind: "fulfillment_service" as const },
          { locationId: "gid://shopify/Location/5" }
        ]
      }
    ]
  }

  it("classifies from the managing app until the buyer chooses", () => {
    expect(Object.fromEntries(locationClassifications(stock, []))).toEqual({
      "gid://shopify/Location/1": "merchant",
      "gid://shopify/Location/2": "amazon_mirror",
      "gid://shopify/Location/3": "excluded",
      "gid://shopify/Location/4": "unresolved",
      "gid://shopify/Location/5": "unresolved"
    })
  })

  it("prefers the buyer's saved choice, including for locations missing from the snapshot", () => {
    const saved = [
      { locationId: "gid://shopify/Location/3", classification: "merchant" as const },
      { locationId: "gid://shopify/Location/9", classification: "excluded" as const }
    ]
    const result = locationClassifications(stock, saved)
    expect(result.get("gid://shopify/Location/3")).toBe("merchant")
    expect(result.get("gid://shopify/Location/9")).toBe("excluded")
    expect(automaticClassification(undefined)).toBe("unresolved")
  })
})
