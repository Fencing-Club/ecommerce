import { describe, expect, it } from "vitest"
import { bundleSales } from "../src/server/bundle-sales"
import { attributeShopifySales, type DemandRow } from "../src/server/sales-attribution"

const glove = "gid://shopify/ProductVariant/1"
const threePack = "gid://shopify/ProductVariant/3"
const catalog = [
  { variantId: glove, buyerSku: "glove" },
  { variantId: threePack, buyerSku: "glove-3pk", bundle: { components: [{ variantId: glove, quantity: 3 }] } },
  { variantId: "gid://shopify/ProductVariant/7", buyerSku: "shared" },
  { variantId: "gid://shopify/ProductVariant/8", buyerSku: "shared" }
]
const row = (fields: Partial<DemandRow>): DemandRow => ({
  variantId: null,
  buyerSku: null,
  locationId: null,
  pool: "shopify",
  bundleVariantId: null,
  fulfilledUnits: 0,
  ...fields
})

describe("bundleSales", () => {
  it("separates items sold alone from items sold in multipacks across Shopify and Amazon", () => {
    const { variants, unmatchedUnits } = bundleSales(catalog, [
      // Shopify: 5 gloves bought alone, and two 3-packs (6 gloves) bought as bundles.
      row({ variantId: glove, buyerSku: "glove", fulfilledUnits: 5 }),
      row({ variantId: glove, buyerSku: "glove", bundleVariantId: threePack, fulfilledUnits: 6 }),
      // Amazon: 4 multipacks and 2 singles, identified by seller SKU.
      row({ buyerSku: "glove-3pk", pool: "fba", fulfilledUnits: 4 }),
      row({ buyerSku: "glove", pool: "fba", fulfilledUnits: 2 }),
      // A SKU on two variants and an unknown SKU can't be attributed.
      row({ buyerSku: "shared", pool: "fba", fulfilledUnits: 1 }),
      row({ buyerSku: "missing", pool: "fba", fulfilledUnits: 2 })
    ])
    expect(variants.get(glove)).toEqual({ soldAlone: 7, soldInBundles: 18, bundlesSold: 0 })
    expect(variants.get(threePack)).toEqual({ soldAlone: 0, soldInBundles: 0, bundlesSold: 6 })
    expect(unmatchedUnits).toBe(3)
  })

  it("leaves the bundle count alone when the bundle's recipe is unknown", () => {
    const unknownRecipe = [{ variantId: threePack, buyerSku: "glove-3pk", bundle: { components: null } }]
    const { variants } = bundleSales(unknownRecipe, [
      row({ variantId: glove, bundleVariantId: threePack, fulfilledUnits: 6 })
    ])
    expect(variants.get(glove)?.soldInBundles).toBe(6)
    expect(variants.get(threePack)).toBeUndefined()
  })
})

describe("Shopify bundle lines", () => {
  it("records which bundle a component line was sold in", () => {
    const location = "gid://shopify/Location/1"
    const line = (id: string, bundle: boolean) => ({
      id,
      quantity: 3,
      currentQuantity: 3,
      sku: "glove",
      variant: { id: glove },
      lineItemGroup: bundle ? { id: "group", quantity: 1, variantId: threePack } : null
    })
    const { rows } = attributeShopifySales(
      [
        {
          id: "gid://shopify/Order/1",
          createdAt: "2026-09-01T00:00:00Z",
          cancelledAt: null,
          test: false,
          sourceName: "web",
          lines: [line("a", true), line("b", false)],
          fulfillments: [
            {
              id: "f",
              status: "SUCCESS",
              location: { id: location },
              lines: [
                { id: "fa", quantity: 3, lineItem: { id: "a" } },
                { id: "fb", quantity: 3, lineItem: { id: "b" } }
              ]
            }
          ]
        }
      ],
      new Map([[location, "merchant" as const]])
    )
    expect(rows.map((demand) => [demand.bundleVariantId, demand.fulfilledUnits])).toEqual([
      [threePack, 3],
      [null, 3]
    ])
  })
})
