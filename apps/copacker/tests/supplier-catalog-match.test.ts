import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { matchSupplierCatalog } from "../src/server/supplier-catalog-match"
const supplierOrgId = randomUUID(),
  otherOrgId = randomUUID()
const base = {
  id: randomUUID(),
  supplierOrgId,
  supplierSku: "OK-160",
  revision: 1,
  active: true,
  currency: "USD" as const,
  priceMinor: 16000,
  priceBasis: "case" as const,
  piecesPerSellablePack: 2,
  sellablePacksPerCase: 80
}
const lookup = { supplierOrgId, supplierSku: "OK-160", currency: "USD" }
describe("supplier catalog PO defaults", () => {
  it("uses exact supplier-scoped SKU and converts a case quote only when cents divide exactly", () => {
    expect(matchSupplierCatalog(lookup, [{ ...base, supplierOrgId: otherOrgId }, base])).toMatchObject({
      status: "matched",
      unitPriceMinor: 100,
      product: { id: base.id }
    })
    expect(matchSupplierCatalog({ ...lookup, supplierSku: " OK-160 " }, [base]).status).toBe("matched")
    expect(matchSupplierCatalog({ ...lookup, supplierSku: "ok-160" }, [base]).status).toBe("not_in_supplier_catalog")
  })
  it("accepts persisted product rows with display and timestamp fields", () => {
    expect(
      matchSupplierCatalog(lookup, [{ ...base, title: "Foil cord", notes: null, createdAt: new Date() }])
    ).toMatchObject({
      status: "matched",
      product: { title: "Foil cord" }
    })
  })
  it("keeps unmatched or missing buyer products reorderable", () => {
    expect(matchSupplierCatalog(lookup, []).status).toBe("not_in_supplier_catalog")
    expect(matchSupplierCatalog({ ...lookup, supplierSku: null }, [base]).status).toBe("supplier_sku_missing")
    expect(matchSupplierCatalog({ ...lookup, supplierOrgId: null }, [base]).status).toBe("supplier_catalog_unavailable")
  })
  it("never defaults archived, ambiguous or wrong-currency prices", () => {
    expect(matchSupplierCatalog(lookup, [{ ...base, active: false }])).toMatchObject({
      status: "archived_supplier_product",
      unitPriceMinor: null
    })
    expect(matchSupplierCatalog(lookup, [base, { ...base, id: randomUUID() }])).toMatchObject({
      status: "ambiguous_supplier_sku",
      unitPriceMinor: null
    })
    expect(matchSupplierCatalog({ ...lookup, currency: "CNY" }, [base])).toMatchObject({
      status: "currency_review",
      unitPriceMinor: null
    })
  })
  it("requires editable price review for missing or fractional cents", () => {
    expect(matchSupplierCatalog(lookup, [{ ...base, priceMinor: null }]).status).toBe("price_missing")
    expect(matchSupplierCatalog(lookup, [{ ...base, priceMinor: 25000 }])).toMatchObject({
      status: "price_conversion_review",
      unitPriceMinor: null
    })
  })
  it("converts sellable pack quotes using explicit pieces per pack", () => {
    expect(matchSupplierCatalog(lookup, [{ ...base, priceBasis: "sellable_pack", priceMinor: 800 }])).toMatchObject({
      status: "matched",
      unitPriceMinor: 400
    })
    expect(matchSupplierCatalog(lookup, [{ ...base, priceBasis: "piece", priceMinor: 400 }])).toMatchObject({
      status: "matched",
      unitPriceMinor: 400
    })
  })
  it("rejects invalid quantities and unsafe case multipliers", () => {
    expect(() => matchSupplierCatalog(lookup, [{ ...base, piecesPerSellablePack: 0 }])).toThrow("piecesPerSellablePack")
    expect(() =>
      matchSupplierCatalog(lookup, [
        { ...base, piecesPerSellablePack: Number.MAX_SAFE_INTEGER, sellablePacksPerCase: 2 }
      ])
    ).toThrow("supported range")
  })
})
