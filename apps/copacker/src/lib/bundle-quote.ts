import type { SupplierCatalogStatus } from "@repo/copacker-orders"
type Component = { quantity: number; supplierSku: string | null }
type Match = { status: SupplierCatalogStatus; unitPriceMinor: number | null }

// Catalog prices are per physical piece after conversion. A bundle's PO price is also per piece,
// so only default it when the weighted total divides exactly across all pieces.
export function bundleQuote(
  components: Component[],
  matches: Match[]
): { status: SupplierCatalogStatus; unitPriceMinor: number | null } {
  if (components.length !== matches.length || !components.length) {
    return { status: "supplier_sku_missing", unitPriceMinor: null }
  }
  let pieces = 0
  let amount = 0
  for (const [index, component] of components.entries()) {
    if (!component.supplierSku) {
      return { status: "supplier_sku_missing", unitPriceMinor: null }
    }
    const match = matches[index]
    if (!match || match.status !== "matched" || match.unitPriceMinor === null) {
      return { status: match?.status ?? "supplier_sku_missing", unitPriceMinor: null }
    }
    pieces += component.quantity
    amount += component.quantity * match.unitPriceMinor
  }
  if (!Number.isSafeInteger(pieces) || !Number.isSafeInteger(amount)) {
    return { status: "price_conversion_review", unitPriceMinor: null }
  }
  return amount % pieces === 0
    ? { status: "matched", unitPriceMinor: amount / pieces }
    : { status: "price_conversion_review", unitPriceMinor: null }
}
