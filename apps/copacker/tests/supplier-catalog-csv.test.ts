import { describe, expect, it } from "vitest"
import {
  catalogRevisionHash,
  catalogTemplate,
  exportSupplierCatalogCsv,
  parseSupplierCatalogCsv
} from "../src/server/supplier-catalog-csv"

describe("supplier catalog CSV", () => {
  const row = 'GD01,"Foil sword, electric",USD,16.50,piece,1,10,"Supplier says ""new""",yes,40,No'
  it("reads Excel-compatible quoted CSV and exact minor-unit prices", () => {
    expect(parseSupplierCatalogCsv(`${catalogTemplate}${row}\r\n`)).toEqual([
      {
        supplierSku: "GD01",
        title: "Foil sword, electric",
        currency: "USD",
        priceMinor: 1650,
        priceBasis: "piece",
        piecesPerSellablePack: 1,
        sellablePacksPerCase: 10,
        notes: 'Supplier says "new"',
        trackInventory: true,
        onHand: 40,
        continueSelling: false
      }
    ])
  })
  it("keeps the on hand count when its cell is blank and rejects other stock values", () => {
    expect(parseSupplierCatalogCsv(`${catalogTemplate}A,Item,USD,,piece,1,1,,,,`)[0]).toMatchObject({
      trackInventory: false,
      onHand: null,
      continueSelling: false
    })
    expect(() => parseSupplierCatalogCsv(`${catalogTemplate}A,Item,USD,,piece,1,1,,maybe,,`)).toThrow("yes or no")
    expect(() => parseSupplierCatalogCsv(`${catalogTemplate}A,Item,USD,,piece,1,1,,yes,1.5,`)).toThrow("on_hand")
  })
  it("keeps unknown prices blank and rejects duplicate SKUs", () => {
    expect(parseSupplierCatalogCsv(`${catalogTemplate}A,Item,USD,,piece,1,1,,,,`)[0]?.priceMinor).toBeNull()
    expect(() => parseSupplierCatalogCsv(`${catalogTemplate}${row}\n${row}`)).toThrow("duplicate supplier SKU")
  })
  it("rejects invalid headers, prices, pack quantities, and oversized files", () => {
    expect(() => parseSupplierCatalogCsv("sku,title\nA,B")).toThrow("template headers")
    expect(() => parseSupplierCatalogCsv(`${catalogTemplate}A,Item,USD,1.234,piece,1,1,,,,`)).toThrow("price")
    expect(() => parseSupplierCatalogCsv(`${catalogTemplate}A,Item,USD,1.00,piece,0,1,,,,`)).toThrow(
      "pieces_per_sellable_pack"
    )
    expect(() => parseSupplierCatalogCsv(`${catalogTemplate}A,Item,USD,99999999.99,piece,1,1,,,,`)).toThrow(
      "price exceeds the supported range"
    )
    expect(() => parseSupplierCatalogCsv("x".repeat(2 * 1024 * 1024 + 1))).toThrow("2 MB")
  })
  it("changes the preview token when a supplier product is edited", () => {
    const a = { supplierSku: "A", id: "one", revision: 1 }
    const b = { supplierSku: "B", id: "two", revision: 1 }
    expect(catalogRevisionHash([a, b])).toBe(catalogRevisionHash([b, a]))
    expect(catalogRevisionHash([a, b])).not.toBe(catalogRevisionHash([a, { ...b, revision: 2 }]))
  })
  it("escapes formula-looking supplier text for Excel while preserving import identity", () => {
    const exported = exportSupplierCatalogCsv([
      {
        supplierSku: "=dangerous",
        title: "+Another formula",
        currency: "USD",
        priceMinor: 0,
        priceBasis: "piece",
        piecesPerSellablePack: 1,
        sellablePacksPerCase: null,
        notes: "@note",
        trackInventory: false,
        onHand: 0,
        continueSelling: false
      }
    ])
    expect(exported).toContain('"\t=dangerous"')
    expect(parseSupplierCatalogCsv(exported)[0]).toMatchObject({
      supplierSku: "=dangerous",
      title: "+Another formula",
      notes: "@note",
      priceMinor: 0
    })
  })
  it("preserves a numeric-looking supplier SKU when edited in Excel", () => {
    const exported = exportSupplierCatalogCsv([
      {
        supplierSku: "001234",
        title: "Foil cord",
        currency: "USD",
        priceMinor: null,
        priceBasis: "piece",
        piecesPerSellablePack: 1,
        sellablePacksPerCase: null,
        notes: null,
        trackInventory: true,
        onHand: 12,
        continueSelling: true
      }
    ])
    expect(exported).toContain('"\t001234"')
    expect(parseSupplierCatalogCsv(exported)[0]).toMatchObject({
      supplierSku: "001234",
      trackInventory: true,
      onHand: 12,
      continueSelling: true
    })
  })
})
