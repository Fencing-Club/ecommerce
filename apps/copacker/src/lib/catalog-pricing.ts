import { createTranslator, type MessageKeys, type NestedKeyOf } from "use-intl"
import { z } from "zod"
import supplier from "../../messages/en/supplier.json"

// Volume pricing and quantity rules, as Shopify's catalogs have them. Quantities are in the product's price basis:
// units, sellable packs or cases. A break's price applies from its minimum up; below the first break, the product's
// own price does.
export type PriceBreak = { minimum: number; priceMinor: number }
export type QuantityRules = { increment: number; minimum: number; maximum: number | null }
export type Pricing = { priceMinor: number | null; priceBreaks: PriceBreak[]; quantityRules: QuantityRules }

export const defaultQuantityRules: QuantityRules = { increment: 1, minimum: 1, maximum: null }

const quantity = z.number().int().positive().max(10_000_000)
const money = z.number().int().nonnegative().max(2_147_483_647)
export const priceBreakSchema = z.object({ minimum: quantity, priceMinor: money })
export const quantityRulesSchema = z.object({ increment: quantity, minimum: quantity, maximum: quantity.nullable() })

export const priceBases = ["piece", "sellable_pack", "case"] as const
export type PriceBasis = (typeof priceBases)[number]

type PricingMessages = (typeof supplier)["pricing"]
// Translates the "supplier.pricing" messages: a page's `useTranslations("supplier.pricing")`, or English by default for
// the server's checks and exports.
export type PricingText = (
  key: MessageKeys<PricingMessages, NestedKeyOf<PricingMessages>>,
  values?: Record<string, string | number>
) => string

export const englishPricing: PricingText = createTranslator({
  locale: "en",
  messages: { supplier },
  namespace: "supplier.pricing"
})

// "1 case", "12 cases".
export function countOf(count: number, basis: PriceBasis, t: PricingText = englishPricing) {
  return t("count", { count, basis })
}

export function unitName(basis: PriceBasis, t: PricingText = englishPricing) {
  return t("unit", { basis })
}

// What's wrong with a price's volume pricing and quantity rules, checked as Shopify checks them, or null.
export function pricingProblem(
  priceMinor: number | null,
  breaks: PriceBreak[],
  rules: QuantityRules,
  t: PricingText = englishPricing
) {
  if (rules.minimum % rules.increment !== 0) {
    return t("minimumMultiple")
  }
  if (rules.maximum !== null && rules.maximum < rules.minimum) {
    return t("maximumBelowMinimum")
  }
  if (rules.maximum !== null && rules.maximum % rules.increment !== 0) {
    return t("maximumMultiple")
  }
  if (breaks.length && priceMinor === null) {
    return t("priceFirst")
  }
  let previous = { minimum: rules.minimum, priceMinor: priceMinor ?? 0 }
  for (const priceBreak of breaks) {
    if (priceBreak.minimum <= previous.minimum) {
      return priceBreak.minimum <= rules.minimum ? t("breakAboveMinimum") : t("breaksAscend")
    }
    if (priceBreak.minimum % rules.increment !== 0) {
      return t("breakMultiple")
    }
    if (rules.maximum !== null && priceBreak.minimum > rules.maximum) {
      return t("breakAboveMaximum")
    }
    if (priceBreak.priceMinor >= previous.priceMinor) {
      return t("breakPriceDescends")
    }
    previous = priceBreak
  }
  return null
}

// A price moved by a catalog's adjustment, in hundredths of a percent: -1000 takes 10% off.
export function adjustPrice(priceMinor: number, basisPoints: number) {
  return Math.max(0, Math.round((priceMinor * (10_000 + basisPoints)) / 10_000))
}

export type CatalogEntry = {
  priceMinor: number | null
  priceBreaks: PriceBreak[] | null
  quantityRules: QuantityRules | null
}

// A product's pricing in a catalog. A fixed price replaces the adjusted one, and with it the product's volume
// pricing; the catalog's own volume pricing and quantity rules replace the product's.
export function catalogPricing(product: Pricing, adjustmentBasisPoints: number, entry: CatalogEntry | null): Pricing {
  const fixed = entry?.priceMinor ?? null
  return {
    priceMinor: fixed ?? (product.priceMinor === null ? null : adjustPrice(product.priceMinor, adjustmentBasisPoints)),
    priceBreaks:
      entry?.priceBreaks ??
      (fixed === null
        ? product.priceBreaks.map((priceBreak) => ({
            minimum: priceBreak.minimum,
            priceMinor: adjustPrice(priceBreak.priceMinor, adjustmentBasisPoints)
          }))
        : []),
    quantityRules: entry?.quantityRules ?? product.quantityRules
  }
}

// The unit price for an order of this many price basis units.
export function unitPriceAt(pricing: Pick<Pricing, "priceMinor" | "priceBreaks">, count: number) {
  let price = pricing.priceMinor
  for (const priceBreak of pricing.priceBreaks) {
    if (count >= priceBreak.minimum) {
      price = priceBreak.priceMinor
    }
  }
  return price
}

// Why a quantity breaks the rules, in a few words, or null.
export function quantityProblem(
  rules: QuantityRules,
  count: number,
  basis: PriceBasis,
  t: PricingText = englishPricing
) {
  if (count < rules.minimum) {
    return t("minimumQuantity", { quantity: countOf(rules.minimum, basis, t) })
  }
  if (rules.maximum !== null && count > rules.maximum) {
    return t("maximumQuantity", { quantity: countOf(rules.maximum, basis, t) })
  }
  if (count % rules.increment !== 0) {
    return t("multiplesOf", { increment: rules.increment })
  }
  return null
}

// "10% off", "5% more", or null for no change. Basis points keep two decimals, such as 12.5%.
export function adjustmentLabel(basisPoints: number, t: PricingText = englishPricing) {
  if (!basisPoints) {
    return null
  }
  const percent = Math.abs(basisPoints) / 10_000
  return basisPoints < 0 ? t("adjustmentOff", { percent }) : t("adjustmentMore", { percent })
}
