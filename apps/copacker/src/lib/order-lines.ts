import type { OrderInput } from "@repo/aisle"
import type { CatalogVariant } from "@repo/aisle/shopify"

// A new PO line for a Shopify variant. Amazon identifiers are looked up on the server when the PO is saved or sent.
export function orderLine(
  variant: CatalogVariant,
  id: string,
  amazon: { asin: string; fnsku: string } = { asin: "", fnsku: "" }
): OrderInput["items"][number] {
  return {
    id,
    variantId: variant.id,
    inventoryItemId: variant.inventoryItem.id,
    name: variant.product.title,
    variant: variant.title,
    buyerSku: variant.sku ?? "",
    supplierSku: variant.supplierSku?.value ?? "",
    asin: amazon.asin || variant.asin?.value || "",
    fnsku: amazon.fnsku,
    pieces: 1,
    piecesPerSet: 1,
    unitPrice: 0,
    instructions: "",
    prepCategory: "POLYBAGGING"
  }
}
