import { describe, expect, it } from "vitest"
import { bundleQuote } from "../src/lib/bundle-quote"

describe("bundle supplier quotes", () => {
  it("matches component SKUs and converts a bundle to an exact per-piece PO price", () => {
    expect(
      bundleQuote(
        [
          { supplierSku: "A", quantity: 2 },
          { supplierSku: "B", quantity: 1 }
        ],
        [
          { status: "matched", unitPriceMinor: 100 },
          { status: "matched", unitPriceMinor: 400 }
        ]
      )
    ).toEqual({ status: "matched", unitPriceMinor: 200 })
  })
  it("keeps missing codes and fractional-cent quotes for review", () => {
    expect(bundleQuote([{ supplierSku: null, quantity: 2 }], [{ status: "matched", unitPriceMinor: 100 }]).status).toBe(
      "supplier_sku_missing"
    )
    expect(
      bundleQuote(
        [
          { supplierSku: "A", quantity: 2 },
          { supplierSku: "B", quantity: 1 }
        ],
        [
          { status: "matched", unitPriceMinor: 100 },
          { status: "matched", unitPriceMinor: 101 }
        ]
      ).status
    ).toBe("price_conversion_review")
  })
})
