import { describe, expect, it } from "vitest"
import {
  adjustPrice,
  adjustmentLabel,
  catalogPricing,
  defaultQuantityRules,
  pricingProblem,
  quantityProblem,
  unitPriceAt
} from "../src/lib/catalog-pricing"
import { variantsProblem, variantTitle } from "../src/lib/supplier-product"

const product = {
  priceMinor: 1000,
  priceBreaks: [
    { minimum: 10, priceMinor: 900 },
    { minimum: 50, priceMinor: 800 }
  ],
  quantityRules: defaultQuantityRules
}

describe("catalog pricing", () => {
  it("checks quantity rules and volume pricing as Shopify does", () => {
    expect(pricingProblem(1000, product.priceBreaks, defaultQuantityRules)).toBeNull()
    expect(pricingProblem(1000, [], { increment: 5, minimum: 7, maximum: null })).toBe(
      "The minimum must be a multiple of the increment"
    )
    expect(pricingProblem(1000, [], { increment: 1, minimum: 10, maximum: 5 })).toBe(
      "The maximum can't be less than the minimum"
    )
    expect(pricingProblem(1000, [{ minimum: 10, priceMinor: 900 }], { increment: 1, minimum: 10, maximum: null })).toBe(
      "Each break's quantity must be more than the minimum"
    )
    expect(
      pricingProblem(
        1000,
        [
          { minimum: 50, priceMinor: 800 },
          { minimum: 10, priceMinor: 700 }
        ],
        defaultQuantityRules
      )
    ).toBe("Break quantities must go up")
    expect(
      pricingProblem(1000, [{ minimum: 15, priceMinor: 900 }], { increment: 10, minimum: 10, maximum: null })
    ).toBe("Break quantities must be multiples of the increment")
    expect(pricingProblem(1000, [{ minimum: 10, priceMinor: 1000 }], defaultQuantityRules)).toBe(
      "Each break's price must be lower than the one before"
    )
    expect(pricingProblem(null, [{ minimum: 10, priceMinor: 900 }], defaultQuantityRules)).toBe(
      "Add a price before volume pricing"
    )
  })

  it("adjusts prices by basis points, rounding to the cent", () => {
    expect(adjustPrice(1000, -1000)).toBe(900)
    expect(adjustPrice(999, -1250)).toBe(874)
    expect(adjustPrice(1000, 500)).toBe(1050)
    expect(adjustPrice(1000, -10_000)).toBe(0)
    expect(adjustmentLabel(-1250)).toBe("12.5% off")
    expect(adjustmentLabel(500)).toBe("5% more")
    expect(adjustmentLabel(0)).toBeNull()
  })

  it("gives a catalog's price: adjusted, or fixed without the product's volume pricing, or its own", () => {
    expect(catalogPricing(product, -1000, null)).toEqual({
      priceMinor: 900,
      priceBreaks: [
        { minimum: 10, priceMinor: 810 },
        { minimum: 50, priceMinor: 720 }
      ],
      quantityRules: defaultQuantityRules
    })
    expect(catalogPricing(product, -1000, { priceMinor: 950, priceBreaks: null, quantityRules: null })).toMatchObject({
      priceMinor: 950,
      priceBreaks: []
    })
    const own = {
      priceMinor: 950,
      priceBreaks: [{ minimum: 20, priceMinor: 850 }],
      quantityRules: { increment: 5, minimum: 5, maximum: null }
    }
    expect(catalogPricing(product, -1000, own)).toEqual(own)
  })

  it("prices an order from the highest break it reaches, and names a quantity outside the rules", () => {
    expect(unitPriceAt(product, 9)).toBe(1000)
    expect(unitPriceAt(product, 10)).toBe(900)
    expect(unitPriceAt(product, 500)).toBe(800)
    const rules = { increment: 6, minimum: 12, maximum: 120 }
    expect(quantityProblem(rules, 6, "case")).toBe("Minimum 12 cases")
    expect(quantityProblem(rules, 126, "piece")).toBe("Maximum 120 units")
    expect(quantityProblem(rules, 20, "piece")).toBe("Order in multiples of 6")
    expect(quantityProblem(rules, 18, "piece")).toBeNull()
  })
})

describe("supplier product variants", () => {
  const variant = {
    supplierSku: "UF-1",
    options: { Hand: "Left", Size: "5" },
    priceMinor: 100,
    piecesPerSellablePack: 1,
    sellablePacksPerCase: null,
    priceBreaks: [],
    quantityRules: defaultQuantityRules
  }

  it("names a variant by its product and option values", () => {
    expect(variantTitle("Blade", variant.options, ["Hand", "Size"])).toBe("Blade (Left, 5)")
    expect(variantTitle("Blade", {}, [])).toBe("Blade")
  })

  it("needs a value for every option, distinct values and SKUs", () => {
    const optionNames = ["Hand", "Size"]
    expect(variantsProblem({ optionNames, variants: [variant] })).toBeNull()
    expect(variantsProblem({ optionNames, variants: [{ ...variant, options: { Hand: "Left" } }] })).toBe(
      "Give UF-1 a value for every option"
    )
    expect(variantsProblem({ optionNames, variants: [variant, { ...variant, supplierSku: "UF-2" }] })).toBe(
      "Two variants have the same options"
    )
    expect(
      variantsProblem({ optionNames, variants: [variant, { ...variant, options: { Hand: "Right", Size: "5" } }] })
    ).toBe("Two variants have the same SKU")
    expect(variantsProblem({ optionNames: ["Size", "size"], variants: [variant] })).toBe(
      "Each option needs its own name"
    )
  })
})
