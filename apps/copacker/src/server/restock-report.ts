import type { VariantSales } from "./bundle-sales"
import type { InventoryProduct } from "./inventory-products"
import { restockRecommendation } from "./restock"

// Lead times the Inventory page offers, in days.
export const leadTimes = [28, 56, 90] as const

export type RestockSuggestion = {
  // Days until the counted stock runs out at the observed rate; null without sales.
  daysRemaining: number | null
  // Sellable units to order so stock lasts through the lead time; null when an input is unknown.
  purchaseUnits: number | null
  stockoutBeforeArrival: boolean | null
}

// A restock suggestion for every tracked variation. Stock is what the Inventory page counts (your locations and
// Amazon's mirror, never excluded ones), incoming is what's on order plus Shopify's own incoming, and demand is every
// unit that left, whether sold alone or inside a bundle. Bundles hold no stock of their own, so they get none;
// their items do.
export function restockReport(
  products: InventoryProduct[],
  sales: ReadonlyMap<string, VariantSales> | null,
  { salesDays, leadTimeDays }: { salesDays: number; leadTimeDays: number }
) {
  const suggestions = new Map<string, RestockSuggestion>()
  for (const variant of products.flatMap((product) => product.variants)) {
    if (variant.stock !== "tracked") {
      continue
    }
    const sold = sales?.get(variant.variantId)
    const result = restockRecommendation(
      {
        available: variant.available,
        verifiedIncoming: variant.onOrder.units + Math.max(0, variant.incoming ?? 0),
        // With sales loaded, a variant absent from them sold nothing in the period.
        soldUnits: sales ? (sold?.soldAlone ?? 0) + (sold?.soldInBundles ?? 0) : null,
        caseQuantity: null,
        unitCostMinor: null,
        stocked: true,
        // Shopify stock, Shopify sales and Amazon sales matched by exact SKU all count the same sellable unit.
        unitsVerified: true
      },
      { leadTimeDays, salesWindowDays: salesDays }
    )
    suggestions.set(variant.variantId, {
      daysRemaining: result.daysRemaining === null ? null : Math.floor(result.daysRemaining),
      purchaseUnits: result.purchaseUnits,
      stockoutBeforeArrival: result.stockoutBeforeArrival
    })
  }
  return suggestions
}

// The variations worth reordering, most urgent first: those running out soonest, then the largest orders. Each shows
// how it sold (alone or inside bundles) so the buyer can choose between the item and a multipack.
export function reorderList(
  products: InventoryProduct[],
  suggestions: ReadonlyMap<string, RestockSuggestion>,
  sales: ReadonlyMap<string, VariantSales> = new Map()
) {
  return products
    .flatMap((product) =>
      product.variants.flatMap((variant) => {
        const suggestion = suggestions.get(variant.variantId)
        return suggestion?.purchaseUnits
          ? [
              {
                variantId: variant.variantId,
                product: product.title,
                variant: variant.title,
                sku: variant.sku,
                imageUrl: variant.imageUrl ?? product.imageUrl,
                purchaseUnits: suggestion.purchaseUnits,
                daysRemaining: suggestion.daysRemaining,
                soldAlone: sales.get(variant.variantId)?.soldAlone ?? 0,
                soldInBundles: sales.get(variant.variantId)?.soldInBundles ?? 0
              }
            ]
          : []
      })
    )
    .toSorted(
      (a, b) =>
        (a.daysRemaining ?? Number.MAX_SAFE_INTEGER) - (b.daysRemaining ?? Number.MAX_SAFE_INTEGER) ||
        b.purchaseUnits - a.purchaseUnits
    )
}

// Bundles (such as multipacks) that sold in the period, busiest first. They hold no stock of their own; restocking a
// multipack means ordering it as its own product, so these show demand for it next to the items it contains.
export function multipackSales(products: InventoryProduct[], sales: ReadonlyMap<string, VariantSales>) {
  return products
    .flatMap((product) =>
      product.variants.flatMap((variant) => {
        const bundlesSold = sales.get(variant.variantId)?.bundlesSold ?? 0
        return variant.stock === "bundle" && bundlesSold > 0
          ? [
              {
                variantId: variant.variantId,
                product: product.title,
                variant: variant.title,
                sku: variant.sku,
                imageUrl: variant.imageUrl ?? product.imageUrl,
                bundlesSold,
                available: variant.available
              }
            ]
          : []
      })
    )
    .toSorted((a, b) => b.bundlesSold - a.bundlesSold)
}
