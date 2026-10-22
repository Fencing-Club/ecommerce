import type { BundleComponent } from "@repo/copacker-marketplaces/shopify"
import type { DemandRow } from "./sales-attribution"

type CatalogRow = {
  variantId: string
  buyerSku: string | null
  bundle?: { components?: BundleComponent[] | null }
}

// How a variant sold: on its own, or inside a bundle such as a multipack. For a bundle variant, how many bundles sold.
export type VariantSales = { soldAlone: number; soldInBundles: number; bundlesSold: number }

const none = (): VariantSales => ({ soldAlone: 0, soldInBundles: 0, bundlesSold: 0 })

// Splits observed sales into items sold alone and items sold in bundles, so a buyer can tell whether to restock a
// multipack or the single item. Shopify marks each component line with the bundle bought; Amazon sells the multipack
// under the bundle variant's own SKU. Amazon SKUs are matched to Shopify only when exactly one variant has that SKU.
export function bundleSales(catalog: CatalogRow[], rows: DemandRow[]) {
  const variants = new Map<string, VariantSales>()
  const entry = (variantId: string) => {
    const current = variants.get(variantId) ?? none()
    variants.set(variantId, current)
    return current
  }
  const bySku = new Map<string, string | null>()
  for (const row of catalog) {
    if (row.buyerSku) {
      // A SKU shared by several variants can't identify one, so it is marked ambiguous.
      bySku.set(row.buyerSku, bySku.has(row.buyerSku) ? null : row.variantId)
    }
  }
  const components = new Map(
    catalog.flatMap((row) => (row.bundle ? [[row.variantId, row.bundle.components ?? null]] : []))
  )
  // Units of each component shipped inside each bundle, to count the bundles once all rows are read.
  const shippedInBundles = new Map<string, Map<string, number>>()
  let unmatchedUnits = 0
  for (const row of rows) {
    const variantId = row.variantId ?? (row.buyerSku ? bySku.get(row.buyerSku) : null)
    if (!variantId) {
      unmatchedUnits += row.fulfilledUnits
      continue
    }
    if (row.bundleVariantId) {
      entry(variantId).soldInBundles += row.fulfilledUnits
      const byComponent = shippedInBundles.get(row.bundleVariantId) ?? new Map<string, number>()
      byComponent.set(variantId, (byComponent.get(variantId) ?? 0) + row.fulfilledUnits)
      shippedInBundles.set(row.bundleVariantId, byComponent)
    } else if (components.has(variantId)) {
      // The bundle itself sold, as Amazon reports multipacks.
      entry(variantId).bundlesSold += row.fulfilledUnits
      for (const component of components.get(variantId) ?? []) {
        entry(component.variantId).soldInBundles += row.fulfilledUnits * component.quantity
      }
    } else {
      entry(variantId).soldAlone += row.fulfilledUnits
    }
  }
  for (const [bundleId, byComponent] of shippedInBundles) {
    // A bundle counts as sold once any of its components shipped; a partial shipment still started the sale.
    const quantities = new Map(
      (components.get(bundleId) ?? []).map((component) => [component.variantId, component.quantity])
    )
    if (!quantities.size) {
      // Without the bundle's recipe the number of bundles is unknown; its items still count as sold in bundles.
      continue
    }
    const bundles = Math.max(
      0,
      ...[...byComponent].map(([componentId, units]) => Math.ceil(units / (quantities.get(componentId) ?? 1)))
    )
    entry(bundleId).bundlesSold += bundles
  }
  return { variants, unmatchedUnits }
}
