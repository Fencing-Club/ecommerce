import { z } from "zod"

const positive = z.number().int().safe().positive()
const money = z.number().int().safe().nonnegative()
const catalogProductSchema = z.object({
  id: z.uuid(),
  supplierOrgId: z.uuid(),
  supplierSku: z.string().trim().min(1).max(255),
  title: z.string().optional(),
  notes: z.string().nullable().optional(),
  revision: positive,
  active: z.boolean(),
  currency: z.enum(["USD", "CNY", "EUR", "GBP", "CAD", "AUD"]),
  priceMinor: money.nullable(),
  priceBasis: z.enum(["piece", "sellable_pack", "case"]),
  piecesPerSellablePack: positive,
  sellablePacksPerCase: positive.nullable()
})
const lookupSchema = z.strictObject({
  supplierOrgId: z.uuid().nullable(),
  supplierSku: z.string().trim().max(255).nullable(),
  currency: catalogProductSchema.shape.currency
})

// This resolves buyer PO defaults. The caller must fetch only catalogs belonging to linked suppliers;
// we still recheck supplierOrgId so a mixed source cannot leak or cross-match a reused SKU.
export function matchSupplierCatalog(raw: unknown, products: Iterable<unknown>) {
  const input = lookupSchema.parse(raw)
  if (!input.supplierOrgId) {
    return { status: "supplier_catalog_unavailable" as const, product: null, unitPriceMinor: null }
  }
  if (!input.supplierSku) {
    return { status: "supplier_sku_missing" as const, product: null, unitPriceMinor: null }
  }
  const matches = []
  for (const rawProduct of products) {
    const product = catalogProductSchema.parse(rawProduct)
    if (product.supplierOrgId === input.supplierOrgId && product.supplierSku === input.supplierSku) {
      matches.push(product)
    }
  }
  if (matches.length === 0) {
    return { status: "not_in_supplier_catalog" as const, product: null, unitPriceMinor: null }
  }
  if (matches.length > 1) {
    return { status: "ambiguous_supplier_sku" as const, product: null, unitPriceMinor: null }
  }
  const product = matches[0]!
  if (!product.active) {
    return { status: "archived_supplier_product" as const, product, unitPriceMinor: null }
  }
  if (product.currency !== input.currency) {
    return { status: "currency_review" as const, product, unitPriceMinor: null }
  }
  if (product.priceMinor === null) {
    return { status: "price_missing" as const, product, unitPriceMinor: null }
  }
  let divisor = 1
  if (product.priceBasis === "sellable_pack") {
    divisor = product.piecesPerSellablePack
  } else if (product.priceBasis === "case") {
    if (product.sellablePacksPerCase === null) {
      return { status: "price_conversion_review" as const, product, unitPriceMinor: null }
    }
    divisor = product.piecesPerSellablePack * product.sellablePacksPerCase
  }
  if (!Number.isSafeInteger(divisor)) {
    throw new Error("Supplier pack quantity exceeds the supported range")
  }
  if (product.priceMinor % divisor !== 0) {
    return { status: "price_conversion_review" as const, product, unitPriceMinor: null }
  }
  return { status: "matched" as const, product, unitPriceMinor: product.priceMinor / divisor }
}
