import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { defaultQuantityRules } from "../src/lib/catalog-pricing"
import { readSheet, sheetCsv, sheetRows, sheetWorkbook } from "../src/server/product-sheet"

const product = {
  title: "Épée blade",
  active: true,
  category: "Epee",
  productCode: "UF-60",
  url: "https://example.com/blade",
  description: "Name on the pocket, +€15",
  optionNames: ["Hand", "Size"],
  variants: [
    {
      supplierSku: "007",
      options: { Hand: "Left", Size: "5" },
      currency: "EUR",
      priceMinor: 5195,
      priceBasis: "piece",
      piecesPerSellablePack: 1,
      sellablePacksPerCase: 20,
      trackInventory: true,
      onHand: 12,
      continueSelling: false,
      quantityRules: { increment: 2, minimum: 2, maximum: 40 },
      priceBreaks: [{ minimum: 10, priceMinor: 4900 }],
      notes: "=SUM(A1)"
    },
    {
      supplierSku: "UF-60R",
      options: { Hand: "Right", Size: "5" },
      currency: "EUR",
      priceMinor: 5195,
      priceBasis: "case",
      piecesPerSellablePack: 1,
      sellablePacksPerCase: null,
      trackInventory: false,
      onHand: 0,
      continueSelling: false,
      quantityRules: defaultQuantityRules,
      priceBreaks: [],
      notes: null
    }
  ]
}

const bytes = (text: string) => new TextEncoder().encode(text)

describe("product template", () => {
  it("reads back what it writes, as CSV and as Excel", async () => {
    const rows = sheetRows([product])
    expect(rows.map((row) => row.handle)).toEqual(["uf-60", "uf-60"])
    const fromCsv = await readSheet({ name: "products.csv", bytes: bytes(sheetCsv(rows)) })
    const fromExcel = await readSheet({
      name: "products.xlsx",
      bytes: new Uint8Array(await sheetWorkbook(rows, "Unic"))
    })
    for (const read of [fromCsv, fromExcel]) {
      expect(read).toHaveLength(1)
      expect(read[0]).toMatchObject({
        handle: "uf-60",
        title: "Épée blade",
        category: "Epee",
        description: "Name on the pocket, +€15",
        optionNames: ["Hand", "Size"]
      })
      expect(read[0]!.variants).toMatchObject([
        {
          supplierSku: "007",
          options: { Hand: "Left", Size: "5" },
          priceMinor: 5195,
          onHand: 12,
          quantityRules: { increment: 2, minimum: 2, maximum: 40 },
          priceBreaks: [{ minimum: 10, priceMinor: 4900 }],
          notes: "=SUM(A1)"
        },
        { supplierSku: "UF-60R", priceBasis: "case", onHand: null, quantityRules: defaultQuantityRules }
      ])
    }
  })

  it("counts in units, and still reads earlier templates that said pieces", async () => {
    const rows = sheetRows([{ ...product, variants: [{ ...product.variants[0]!, piecesPerSellablePack: 2 }] }])
    const csv = sheetCsv(rows)
    expect(csv).toContain("Units per pack")
    expect(rows[0]!.priceBasis).toBe("unit")
    const earlier = csv.replace("Units per pack", "Pieces per pack").replace(",unit,", ",piece,")
    expect(earlier).toContain(",piece,")
    const [read] = await readSheet({ name: "products.csv", bytes: bytes(earlier) })
    expect(read!.variants[0]).toMatchObject({ priceBasis: "piece", piecesPerSellablePack: 2 })
  })

  it("keeps Excel from reading codes as numbers or text as formulas", () => {
    const csv = sheetCsv(sheetRows([product]))
    expect(csv.startsWith("﻿Handle,Title,")).toBe(true)
    expect(csv).toContain('"\t007"')
    expect(csv).toContain('"\t=SUM(A1)"')
  })

  it("gives the Excel template dropdowns and instructions", async () => {
    const book = new ExcelJS.Workbook()
    await book.xlsx.load((await sheetWorkbook([], "Unic")) as unknown as ExcelJS.Buffer)
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Products", "Instructions"])
    const status = book.getWorksheet("Products")!.getCell("C2").dataValidation
    expect(status).toMatchObject({ type: "list", formulae: ['"active,archived"'] })
  })

  it("names the row of every mistake", async () => {
    const read = (text: string) => readSheet({ name: "products.csv", bytes: bytes(text) })
    await expect(read("Name,Price\r\nx,1")).rejects.toThrow("Use the product template")
    const header = sheetCsv([]).trim()
    await expect(read(`${header}\r\n,Blade${",".repeat(29)}`)).rejects.toThrow("Row 2: add a handle")
    const rows = sheetRows([product])
    await expect(read(sheetCsv([rows[0]!, { ...rows[1]!, sku: "007" }]))).rejects.toThrow(
      "SKU 007 is in the file twice"
    )
    await expect(read(sheetCsv([{ ...rows[0]!, price: "12.345" }]))).rejects.toThrow("Row 2: Price must be an amount")
    await expect(read(sheetCsv([{ ...rows[0]!, option2Value: "" }]))).rejects.toThrow("Row 2: add a value for Size")
    await expect(read(sheetCsv([rows[0]!, { ...rows[1]!, option1Value: "Left" }]))).rejects.toThrow(
      "Row 3: another variant of uf-60 has the same options"
    )
  })
})
