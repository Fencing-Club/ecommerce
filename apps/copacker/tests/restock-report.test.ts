import { describe, expect, it } from "vitest"
import type { InventoryProduct, InventoryVariant } from "../src/server/inventory-products"
import { reorderList, restockReport } from "../src/server/restock-report"

const variant = (id: number, fields: Partial<InventoryVariant>): InventoryVariant => ({
  variantId: `gid://shopify/ProductVariant/${id}`,
  title: `Size ${id}`,
  sku: `sku-${id}`,
  imageUrl: null,
  stock: "tracked",
  onOrder: { units: 0, orders: [] },
  levels: [],
  available: 0,
  onHand: 0,
  incoming: 0,
  ...fields
})
const product = (variants: InventoryVariant[]): InventoryProduct => ({
  productId: "gid://shopify/Product/1",
  title: "Grip",
  imageUrl: null,
  stock: "tracked",
  onOrder: { units: 0, orders: [] },
  variants,
  available: 0,
  onHand: 0,
  incoming: 0
})
const sold = (soldAlone: number, soldInBundles = 0) => ({ soldAlone, soldInBundles, bundlesSold: 0 })

describe("restock report", () => {
  const products = [
    product([
      // 56 sold in 28 days is 2 a day. 10 in stock and 10 on order last 10 days; 56 days need 112.
      variant(1, { available: 10, onOrder: { units: 10, orders: [] } }),
      // Plenty of stock.
      variant(2, { available: 500 }),
      // Sold only inside multipacks, which still uses up this item.
      variant(3, { available: 0 }),
      variant(4, { stock: "bundle", available: 5 }),
      variant(5, { stock: "untracked", available: null })
    ])
  ]
  const sales = new Map([
    ["gid://shopify/ProductVariant/1", sold(56)],
    ["gid://shopify/ProductVariant/2", sold(28)],
    ["gid://shopify/ProductVariant/3", sold(0, 28)]
  ])

  it("counts items sold alone and in bundles against stock and what's on order", () => {
    const report = restockReport(products, sales, { salesDays: 28, leadTimeDays: 56 })
    expect(report.get("gid://shopify/ProductVariant/1")).toEqual({
      daysRemaining: 5,
      purchaseUnits: 92,
      stockoutBeforeArrival: true
    })
    expect(report.get("gid://shopify/ProductVariant/2")?.purchaseUnits).toBe(0)
    expect(report.get("gid://shopify/ProductVariant/3")?.purchaseUnits).toBe(56)
    // Bundles and untracked items hold no stock of their own.
    expect(report.has("gid://shopify/ProductVariant/4")).toBe(false)
    expect(report.has("gid://shopify/ProductVariant/5")).toBe(false)
    expect(reorderList(products, report).map((line) => [line.sku, line.purchaseUnits])).toEqual([
      ["sku-3", 56],
      ["sku-1", 92]
    ])
  })

  it("suggests nothing without complete sales", () => {
    const report = restockReport(products, null, { salesDays: 28, leadTimeDays: 56 })
    expect(report.get("gid://shopify/ProductVariant/1")).toMatchObject({ purchaseUnits: null, daysRemaining: null })
    expect(reorderList(products, report)).toEqual([])
  })
})
