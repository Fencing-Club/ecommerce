import type { AmazonNetwork } from "@repo/aisle"
import type { OrderInput } from "@repo/aisle"
import type { PrepCategory } from "@repo/aisle"
import type { adjustmentTypes, commonPaymentTerms } from "@repo/aisle"
import type { CatalogVariant } from "@repo/aisle/shopify"
import { bundleSupplierComponents, variantUnitCostMinor } from "@repo/aisle/shopify"

export type LineDefaults = {
  // Looked up on the server when the PO is saved or sent, so often empty here.
  asin?: string
  fnsku?: string
  // From the Shopify bundle (see piecesPerUnit); the server sets it again when the PO is saved.
  piecesPerSet?: number
  // The product's saved defaults from Products.
  description?: string
  prepCategory?: PrepCategory | null
  suffocationWarning?: boolean
  amazonNetwork?: AmazonNetwork
  skuLabel?: boolean
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
    prepCategory: defaults.prepCategory ?? "POLYBAGGING",
    suffocationWarning: defaults.suffocationWarning ?? false,
    amazonNetwork: defaults.amazonNetwork ?? "fba",
    skuLabel: defaults.skuLabel ?? true
  }
}

// Payment terms and cost adjustments are kept on the PO by their English names. These are the known ones' message keys
// under "orders", so they show in the reader's language; any other name shows as typed.
export const paymentTermKeys = {
  "Net 7": "paymentTerms.net7",
  "Net 15": "paymentTerms.net15",
  "Net 30": "paymentTerms.net30",
  "Net 45": "paymentTerms.net45",
  "Net 60": "paymentTerms.net60",
  "Cash on delivery": "paymentTerms.cashOnDelivery",
  "Payment on receipt": "paymentTerms.paymentOnReceipt",
  "Payment in advance": "paymentTerms.paymentInAdvance"
} as const satisfies Record<(typeof commonPaymentTerms)[number], string>

export const adjustmentKeys = {
  "Shipping amount": "adjustments.shipping",
  "Customs duties": "adjustments.customsDuties",
  Discount: "adjustments.discount",
  "Foreign transaction fee": "adjustments.foreignTransactionFee",
  "Freight fee": "adjustments.freightFee",
  Insurance: "adjustments.insurance",
  Labeling: "adjustments.labeling",
  Packing: "adjustments.packing",
  "Rush fee": "adjustments.rushFee",
  Surcharge: "adjustments.surcharge",
  Tariffs: "adjustments.tariffs",
  Other: "adjustments.other"
} as const satisfies Record<(typeof adjustmentTypes)[number], string>

// A stored name in the reader's language when it's one of the known ones, such as a payment term, or as typed.
export function knownName<Key extends string>(
  keys: Record<string, Key>,
  name: string,
  t: (key: Key) => string
): string {
  return Object.hasOwn(keys, name) ? t(keys[name]!) : name
}
