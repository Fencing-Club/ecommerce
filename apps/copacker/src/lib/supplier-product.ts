import {
  englishPricing,
  type PriceBreak,
  type PricingText,
  pricingProblem,
  type QuantityRules
} from "./catalog-pricing"

// A supplier product's photo in document storage, under supplier-images/<supplier workspace>/.
export type ProductImage = { key: string; name: string; contentType: string }

export const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const

export function imageUrl(image: Pick<ProductImage, "key">) {
  return `/api/product-images?key=${encodeURIComponent(image.key)}`
}

// A variant's option values in the product's order, such as "Left / 90cm", or null for a product's only variant.
export function variantLabel(options: Record<string, string>, optionNames: readonly string[]) {
  const values = optionNames.flatMap((name) => (options[name] ? [options[name]] : []))
  return values.length ? values.join(" / ") : null
}

// A variant's full name, which POs and the catalog CSV show: the product's title and its option values.
export function variantTitle(title: string, options: Record<string, string>, optionNames: readonly string[]) {
  const label = variantLabel(options, optionNames)
  return label ? `${title} (${label.replaceAll(" / ", ", ")})` : title
}

type VariantFields = {
  supplierSku: string
  options: Record<string, string>
  priceMinor: number | null
  piecesPerSellablePack: number
  sellablePacksPerCase: number | null
  priceBreaks: PriceBreak[]
  quantityRules: QuantityRules
}
// What's wrong with a product's options and variants, or null: every variant needs a value for each option, and no two
// variants can have the same values or SKU. `t` translates the messages, in English by default.
export function variantsProblem(
  input: { optionNames: string[]; variants: VariantFields[] },
  t: PricingText = englishPricing
) {
  if (new Set(input.optionNames.map((name) => name.toLowerCase())).size !== input.optionNames.length) {
    return t("optionNamesDistinct")
  }
  if (!input.optionNames.length && input.variants.length > 1) {
    return t("optionNeeded")
  }
  const seen = new Set<string>()
  for (const variant of input.variants) {
    if (input.optionNames.some((name) => !variant.options[name])) {
      return t("optionValues", { sku: variant.supplierSku })
    }
    const key = JSON.stringify(input.optionNames.map((name) => variant.options[name]!.toLowerCase()))
    if (seen.has(key)) {
      return t("sameOptions")
    }
    seen.add(key)
    const problem = pricingProblem(variant.priceMinor, variant.priceBreaks, variant.quantityRules, t)
    if (problem) {
      return t("variantProblem", { sku: variant.supplierSku, problem })
    }
    if (
      variant.sellablePacksPerCase !== null &&
      !Number.isSafeInteger(variant.piecesPerSellablePack * variant.sellablePacksPerCase)
    ) {
      return t("packRange", { sku: variant.supplierSku })
    }
  }
  const skus = input.variants.map((variant) => variant.supplierSku)
  return new Set(skus).size === skus.length ? null : t("sameSku")
}
