import { describe, expect, it } from "vitest"
import type { InventoryProduct, InventoryVariant } from "../src/server/inventory-products"
import { reorderList } from "../src/server/restock-report"

const variant = (id: number): InventoryVariant => ({
  variantId: `gid://shopify/ProductVariant/${id}`,
  title: `Size ${id}`,
  sku: `sku-${id}`,
  imageUrl: null,
  stock: "tracked",
  onOrder: { units: 0, orders: [] },
  levels: [],
  available: 0,
  onHand: 0,
  incoming: 0
})

describe("restock review ordering", () => {
  it("shows only positive suggestions, most urgent first", () => {
    const product: InventoryProduct = {
      productId: "gid://shopify/Product/1",
      title: "Grip",
      imageUrl: null,
      stock: "tracked",
      onOrder: { units: 0, orders: [] },
      available: 0,
      onHand: 0,
      incoming: 0,
      variants: [variant(1), variant(2), variant(3)]
    }
    const suggestions = new Map([
      [
        variant(1).variantId,
        {
          daysRemaining: 5,
          purchaseUnits: 92,
          stockoutBeforeArrival: true,
          caseCount: null,
          estimatedCostMinor: null,
          costCurrency: null
        }
      ],
      [
        variant(2).variantId,
        {
          daysRemaining: 1,
          purchaseUnits: 56,
          stockoutBeforeArrival: true,
          caseCount: null,
          estimatedCostMinor: null,
          costCurrency: null
        }
      ],
      [
        variant(3).variantId,
        {
          daysRemaining: null,
          purchaseUnits: null,
          stockoutBeforeArrival: null,
          caseCount: null,
          estimatedCostMinor: null,
          costCurrency: null
        }
      ]
    ])
    expect(reorderList([product], suggestions).map((line) => [line.sku, line.purchaseUnits])).toEqual([
      ["sku-2", 56],
      ["sku-1", 92]
    ])
  })
})
