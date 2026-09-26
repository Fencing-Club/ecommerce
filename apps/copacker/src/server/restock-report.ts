import type { VariantSales } from "./bundle-sales"
import type { InventoryProduct } from "./inventory-products"

// Sales periods and lead times are whole days; Amazon keeps two years of orders.
export const dayRange = { min: 1, max: 730 } as const
// The sales period and lead time restock starts from; the Overview always uses them.
export const restockDefaults = { days: 56, leadTimeDays: 56 } as const

export type RestockSuggestion = {
  // Days until the counted stock runs out at the observed rate; null without sales.
  daysRemaining: number | null
  // Sellable units to order so stock lasts through the lead time; null when an input is unknown.
  purchaseUnits: number | null
  stockoutBeforeArrival: boolean | null
  caseCount: number | null
  estimatedCostMinor: number | null
  costCurrency: string | null
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
                caseCount: suggestion.caseCount,
                estimatedCostMinor: suggestion.estimatedCostMinor,
                costCurrency: suggestion.costCurrency,
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
