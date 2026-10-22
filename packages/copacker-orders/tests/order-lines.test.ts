import type { CatalogVariant } from "@repo/copacker-marketplaces/shopify"
import { describe, expect, it } from "vitest"
import { orderLine } from "../src/index"

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

  it("start with the product's saved defaults, or polybagged and labeled without them", () => {
    expect(orderLine(variant(null), "a")).toMatchObject({
      instructions: "",
      prepCategory: "POLYBAGGING",
      suffocationWarning: false,
      skuLabel: true,
      receiver: "fba"
    })
    const defaults = {
      description: "Fold in half",
      prepCategory: "NO_PREP",
      suffocationWarning: true,
      skuLabel: false
    } as const
    expect(orderLine(variant(null), "a", defaults)).toMatchObject({
      instructions: "Fold in half",
      prepCategory: "NO_PREP",
      suffocationWarning: true,
      skuLabel: false
    })
  })

  // An imported line, or one a supplier's changes add, is built the same way, so a product kept as bulk stock lands at
  // AWD rather than FBA.
  it("keep the product's Amazon network when imported to a PO to Amazon", () => {
    expect(orderLine(variant(null), "a", { amazonNetwork: "awd_us" }, "USD", "amazon").receiver).toBe("awd_us")
    expect(orderLine(variant(null), "a", { amazonNetwork: "awd_us" }, "USD", "warehouse").receiver).toBe("warehouse")
  })

  it("leave a bundle's supplier SKU to its components", () => {
    const bundle: CatalogVariant = {
      ...variant(null),
      supplierSku: { value: "B-2" },
      asin: { value: "B000000001" },
      requiresComponents: true,
      productVariantComponents: {
        nodes: [
          {
            quantity: 2,
            productVariant: { id: "gid://shopify/ProductVariant/99", sku: "cord", supplierSku: { value: "B-2" } }
          }
        ],
        pageInfo: { hasNextPage: false }
      }
    }
    expect(orderLine(bundle, "a", { piecesPerSet: 2 })).toMatchObject({
      supplierSku: "",
      components: [{ variantId: "gid://shopify/ProductVariant/99", buyerSku: "cord", supplierSku: "B-2", quantity: 2 }],
      asin: "B000000001",
      pieces: 2,
      piecesPerSet: 2
    })
  })
})
