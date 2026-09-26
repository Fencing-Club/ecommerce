import type { OrderInput } from "@repo/aisle"
import { describe, expect, it } from "vitest"
import { landedMarkup, landedMarkups } from "../src/server/landed-costs"
import { catalogIndex } from "../src/server/overview-sales"

function order(items: { variantId: string; pieces: number; unitPrice: number }[], adjustments = 0) {
  return {
    items: items.map((item) => ({ ...item, piecesPerSet: 1 })),
    adjustments: adjustments ? [{ description: "Supplier shipping", amount: adjustments }] : []
  } as unknown as Pick<OrderInput, "items" | "adjustments">
}

describe("landed markups", () => {
  it("adds landed costs and PO charges as a share of the products' price", () => {
    // $1,000 of products, a $50 supplier charge and $150 of freight: 20% more to land.
    expect(landedMarkup(order([{ variantId: "a", pieces: 100, unitPrice: 1000 }], 5000), 15000)).toBe(0.2)
    expect(landedMarkup(order([]), 100)).toBeNull()
  })

  it("takes each product's markup from its latest PO with landed costs", () => {
    const markups = landedMarkups([
      {
        data: order([{ variantId: "a", pieces: 10, unitPrice: 1000 }]),
        landedMinor: 1000,
        sentAt: new Date("2026-06-01")
      },
      {
        data: order([
          { variantId: "a", pieces: 10, unitPrice: 1000 },
          { variantId: "b", pieces: 10, unitPrice: 1000 }
        ]),
        landedMinor: 5000,
        sentAt: new Date("2026-08-01")
      },
      // Newest, but its freight isn't entered yet.
      { data: order([{ variantId: "a", pieces: 10, unitPrice: 1000 }]), landedMinor: 0, sentAt: new Date("2026-09-01") }
    ])
    expect(Object.fromEntries(markups)).toEqual({ a: 0.25, b: 0.25 })
  })

  it("puts the markup on unit costs, a bundle's components taking the bundle's when they have none", () => {
    const index = catalogIndex(
      [
        { variantId: "a", buyerSku: "A", unitCostMinor: 400, costCurrency: "USD" },
        { variantId: "b", buyerSku: "B", unitCostMinor: 1000, costCurrency: "USD" },
        { variantId: "pack", buyerSku: "A-3", bundle: { components: [{ variantId: "b", quantity: 3 }] } }
      ],
      new Map([
        ["a", 0.25],
        ["pack", 0.1]
      ])
    )
    expect(index.unitCost(index.variantFor("shopify", "a"))).toEqual({ minor: 500, currency: "USD" })
    expect(index.unitCost(index.variantFor("shopify", "b"))).toEqual({ minor: 1000, currency: "USD" })
    expect(index.unitCost(index.variantFor("amazon", "A-3"))).toEqual({ minor: 3300, currency: "USD" })
  })
})
