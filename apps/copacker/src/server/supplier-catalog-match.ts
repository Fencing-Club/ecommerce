import { orderCurrencies } from "@repo/copacker-orders"
import { z } from "zod"
import { defaultQuantityRules, priceBreakSchema, quantityRulesSchema, type QuantityRules } from "@/lib/catalog-pricing"

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
  currency: z.enum(orderCurrencies),
  priceMinor: money.nullable(),
  priceBasis: z.enum(["piece", "sellable_pack", "case"]),
  piecesPerSellablePack: positive,
  sellablePacksPerCase: positive.nullable(),
  priceBreaks: z.array(priceBreakSchema).default([]),
  quantityRules: quantityRulesSchema.default(defaultQuantityRules)
})
const lookupSchema = z.strictObject({
  supplierOrgId: z.uuid().nullable(),
  supplierSku: z.string().trim().max(255).nullable(),
  currency: catalogProductSchema.shape.currency
})

// A price per piece from each quantity of pieces up, the first from one piece; and the quantity rules in pieces.
export type Tier = { minimumPieces: number; unitPriceMinor: number }
const unpriced = { unitPriceMinor: null, tiers: [] as Tier[], rules: null as QuantityRules | null }

// This resolves buyer PO defaults. The caller must fetch only catalogs belonging to linked suppliers;
// we still recheck supplierOrgId so a mixed source cannot leak or cross-match a reused SKU.
export function matchSupplierCatalog(raw: unknown, products: Iterable<unknown>) {
  const input = lookupSchema.parse(raw)
  if (!input.supplierOrgId) {
    return { status: "supplier_catalog_unavailable" as const, product: null, ...unpriced }
  }
  if (!input.supplierSku) {
    return { status: "supplier_sku_missing" as const, product: null, ...unpriced }
  }
  const matches = []
  for (const rawProduct of products) {
    const product = catalogProductSchema.parse(rawProduct)
    if (product.supplierOrgId === input.supplierOrgId && product.supplierSku === input.supplierSku) {
      matches.push(product)
    }
  }
  if (matches.length === 0) {
    return { status: "not_in_supplier_catalog" as const, product: null, ...unpriced }
  }
  if (matches.length > 1) {
    return { status: "ambiguous_supplier_sku" as const, product: null, ...unpriced }
  }
  const product = matches[0]!
  if (!product.active) {
    return { status: "archived_supplier_product" as const, product, ...unpriced }
  }
  if (product.currency !== input.currency) {
    return { status: "currency_review" as const, product, ...unpriced }
  }
  if (product.priceMinor === null) {
    return { status: "price_missing" as const, product, ...unpriced }
  }
  let divisor = 1
  if (product.priceBasis === "sellable_pack") {
    divisor = product.piecesPerSellablePack
  } else if (product.priceBasis === "case") {
    if (product.sellablePacksPerCase === null) {
      return { status: "price_conversion_review" as const, product, ...unpriced }
    }
    divisor = product.piecesPerSellablePack * product.sellablePacksPerCase
  }
  if (!Number.isSafeInteger(divisor)) {
    throw new Error("Supplier pack quantity exceeds the supported range")
  }
  const prices = [{ minimum: 1, priceMinor: product.priceMinor }, ...product.priceBreaks]
  if (prices.some((price) => price.priceMinor % divisor !== 0)) {
    return { status: "price_conversion_review" as const, product, ...unpriced }
  }
  const { increment, minimum, maximum } = product.quantityRules
  return {
    status: "matched" as const,
    product,
    unitPriceMinor: product.priceMinor / divisor,
    tiers: prices.map((price, index) => ({
      minimumPieces: index === 0 ? 1 : price.minimum * divisor,
      unitPriceMinor: price.priceMinor / divisor
    })),
    rules: {
      increment: increment * divisor,
      minimum: minimum * divisor,
      maximum: maximum === null ? null : maximum * divisor
    }
  }
}
