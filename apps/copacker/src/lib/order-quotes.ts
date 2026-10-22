import type { OrderItem } from "@repo/copacker-shipments"
import type { SupplierCatalogMatch } from "@/lib/api"
import { bundleQuote, type BundleQuoteStatus } from "@/lib/bundle-quote"

// A line as the editor's form holds it, where a supplier SKU may not be filled in yet.
type Line = Pick<OrderItem, "components" | "piecesPerSet"> & { supplierSku?: string }

// A purchase order line's quote from its supplier's catalog: the match, its volume prices and quantity rules in pieces,
// and the pieces the supplier can still sell (null when there's no limit). A bundle's comes from its components'.
export type LineQuote = Pick<SupplierCatalogMatch, "status" | "unitPriceMinor" | "tiers" | "rules" | "available">

// The supplier SKUs a line is looked up by: its own, or each of a bundle's components'.
export function lineSkus(line: Line) {
  return line.components?.length
    ? line.components.map((component) => component.supplierSku?.trim() ?? "")
    : [line.supplierSku?.trim() ?? ""]
}

// Each line's quote, from the catalog's answers to every line's lineSkus in turn. A bundle's price is its components'
// together, and it can have as many units as its scarcest component allows.
export function lineQuotes(lines: readonly Line[], matches: readonly SupplierCatalogMatch[]) {
  let offset = 0
  return lines.map((line): LineQuote | undefined => {
    const count = lineSkus(line).length
    const found = matches.slice(offset, offset + count)
    offset += count
    const { components } = line
    if (!components?.length) {
      return found[0]
    }
    const units = components.flatMap((component, position) => {
      const available = found[position]?.available
      return available === null || available === undefined ? [] : [Math.floor(available / component.quantity)]
    })
    return {
      ...bundleQuote(components, found),
      available: units.length ? Math.min(...units) * line.piecesPerSet : null,
      tiers: [],
      rules: null
    }
  })
}

// The supplier's price for this many pieces: its volume price once the quantity reaches a break.
export function quotedPrice(quote: LineQuote, pieces: number) {
  return quote.tiers.findLast((tier) => pieces >= tier.minimumPieces)?.unitPriceMinor ?? quote.unitPriceMinor
}

// Why a line's price isn't the supplier's quote, in a few words, as its key under orders.builder.matchNotes. A supplier
// without a catalog has nothing to say.
export function matchNote(status: BundleQuoteStatus) {
  switch (status) {
    case "matched":
    case "supplier_catalog_unavailable":
      return null
    case "not_in_supplier_catalog":
      return "notInCatalog"
    case "supplier_sku_missing":
      return "noSupplierSku"
    case "currency_review":
      return "otherCurrency"
    case "price_missing":
      return "noPrice"
    default:
      return "checkPrice"
  }
}
