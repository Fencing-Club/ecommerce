import type { CatalogVariant } from "@repo/copacker-marketplaces/shopify"

export function catalogMatches(variants: Iterable<CatalogVariant>, query: string) {
  const term = query.trim().toLowerCase()
  const exactSku = (v: CatalogVariant) => [v.sku, v.supplierSku?.value].some((s) => s?.toLowerCase() === term)
  return [...variants]
    .filter((v) =>
      [v.sku, v.supplierSku?.value, `${v.product.title} ${v.title}`].some((s) => s?.toLowerCase().includes(term))
    )
    .sort((a, b) => Number(exactSku(b)) - Number(exactSku(a)))
}
