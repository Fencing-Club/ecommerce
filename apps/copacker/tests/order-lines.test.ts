import type { CatalogVariant } from "@repo/copacker-marketplaces/shopify"
import { describe, expect, it } from "vitest"
import { orderLine } from "../src/lib/order-lines"

const variant = (unitCost: CatalogVariant["inventoryItem"]["unitCost"]): CatalogVariant => ({
  id: "gid://shopify/ProductVariant/1",
  title: "Medium",
  sku: "unic-pistol-m",
  product: { id: "gid://shopify/Product/1", title: "Unic pistol" },
  inventoryItem: { id: "gid://shopify/InventoryItem/1", unitCost },
  supplierSku: null,
  asin: null,
  requiresComponents: false,
  productVariantComponents: { nodes: [], pageInfo: { hasNextPage: false } }
})

describe("new PO lines", () => {
  it("start at the Shopify unit cost per piece when it's in the PO's currency", () => {
    expect(orderLine(variant({ amount: "78.50", currencyCode: "USD" }), "a").unitPrice).toBe(7850)
    expect(orderLine(variant({ amount: "21", currencyCode: "USD" }), "a", { piecesPerSet: 2 }).unitPrice).toBe(1050)
  })

  it("start at zero without a cost, or with one in another currency", () => {
    expect(orderLine(variant(null), "a").unitPrice).toBe(0)
    expect(orderLine(variant({ amount: "78.50", currencyCode: "EUR" }), "a").unitPrice).toBe(0)
    expect(orderLine(variant({ amount: "78.50", currencyCode: "EUR" }), "a", {}, "EUR").unitPrice).toBe(7850)
  })
})
