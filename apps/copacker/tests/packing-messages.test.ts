import { describe, expect, it } from "vitest"
import { issueValues, productNames } from "../src/lib/packing-messages"

const products = [
  { buyerSku: "DB-2030", supplierSku: "", name: "Cotton drawstring bag", variant: "Sage" },
  { buyerSku: "DB-2031", supplierSku: "", name: "Cotton drawstring bag", variant: "Natural" },
  { buyerSku: "CT-3100", supplierSku: "NT-CT-3100", name: "Cotton tea towel", variant: "Stripe" }
]

describe("naming a carton's products for the supplier", () => {
  it("uses the supplier SKU, or the name of a product without one", () => {
    expect(productNames(products, ["DB-2030", "CT-3100"])).toEqual(["Cotton drawstring bag", "NT-CT-3100"])
    // Two products without supplier SKUs, of the same name, add their variants.
    expect(productNames(products, ["DB-2030", "DB-2031"])).toEqual([
      "Cotton drawstring bag, Sage",
      "Cotton drawstring bag, Natural"
    ])
    // A SKU the order doesn't have stays a SKU.
    expect(productNames(products, ["CT-3100", "XX-1"])).toEqual(["NT-CT-3100", "XX-1"])
  })

  it("names products that can't share a carton, and leaves other rules' values alone", () => {
    expect(
      issueValues(
        { cartonId: "A1", code: "packingGroups", values: { receiver: "FBA", sku: "CT-3100", other: "DB-2030" } },
        products
      )
    ).toEqual({ receiver: "FBA", product: "NT-CT-3100", other: "Cotton drawstring bag" })
    expect(
      issueValues({ cartonId: "A1", code: "missingAsin", values: { receiver: "FBA", sku: "DB-2030" } }, products)
    ).toEqual({ receiver: "FBA", sku: "DB-2030" })
    expect(issueValues({ code: "noPallets" }, products)).toBeUndefined()
  })
})
