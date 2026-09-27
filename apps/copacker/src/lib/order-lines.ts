import type { OrderInput, PrepCategory } from "@repo/aisle"
import { bundleSupplierComponents, type CatalogVariant, variantUnitCostMinor } from "@repo/aisle/shopify"

export type LineDefaults = {
  // Looked up on the server when the PO is saved or sent, so often empty here.
  asin?: string
  fnsku?: string
  // From the Shopify bundle (see piecesPerUnit); the server sets it again when the PO is saved.
  piecesPerSet?: number
  // The product's saved defaults from Products.
  description?: string
  prepCategory?: PrepCategory | null
}

// A new PO line for a Shopify variant, priced at its Shopify unit cost per piece until a supplier quote or the buyer
// sets one.
export function orderLine(
  variant: CatalogVariant,
  id: string,
  defaults: LineDefaults = {},
  currency = "USD"
): OrderInput["items"][number] {
  const piecesPerSet = defaults.piecesPerSet ?? 1
  return {
    id,
    variantId: variant.id,
    inventoryItemId: variant.inventoryItem.id,
    name: variant.product.title,
    variant: variant.title,
    buyerSku: variant.sku ?? "",
    supplierSku: variant.requiresComponents ? "" : (variant.supplierSku?.value ?? ""),
    components: variant.requiresComponents ? bundleSupplierComponents(variant) : undefined,
    asin: defaults.asin || variant.asin?.value || "",
    fnsku: defaults.fnsku ?? "",
    pieces: piecesPerSet,
    piecesPerSet,
    unitPrice: Math.round((variantUnitCostMinor(variant, currency) ?? 0) / piecesPerSet),
    instructions: defaults.description ?? "",
    prepCategory: defaults.prepCategory ?? "POLYBAGGING"
  }
}
