import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { cartonTotals, expandCartonGroups, groupCartons } from "@/lib/carton-groups"
import { cartonColumns, cartonTemplate, parseCartonTable, readCartonFile } from "@/lib/carton-import"
import { orderData } from "@/stories/fixtures/orders"

const products = orderData().items.map((item, index) => ({ ...item, piecesPerSet: index === 1 ? 2 : 1 }))
const row = (sku = products[0]!.buyerSku, quantity = "10") => ["01", "2", sku, quantity, "60", "40", "40", "12"]
describe("carton import", () => {
  it("groups products, converts multipacks, and expands physical cartons without losing totals", () => {
    const result = parseCartonTable([[...cartonColumns], row(), row(products[1]!.buyerSku, "5")], products)
    expect(result.issues).toEqual([])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.items.map((item) => item.pieces)).toEqual([10, 10])
    expect(cartonTotals(result.groups)).toEqual({ cartons: 2, pieces: 40 })
    const expanded = expandCartonGroups(result.groups)
    expect(expanded.map((carton) => carton.cartonId)).toEqual(["01", "01-2"])
    expect(groupCartons(expanded)).toHaveLength(1)
    expect(groupCartons(expanded)[0]?.count).toBe(2)
    expect(expandCartonGroups(groupCartons(expanded))).toEqual(expanded)
  })
  it("rejects missing, duplicate, and unexpected columns before interpreting rows", () => {
    const result = parseCartonTable([["SKU", "SKU", "Quantity"], row()], products)
    expect(result.templateMatches).toBe(false)
    expect(result.groups).toEqual([])
    expect(result.issues.map((issue) => issue.code)).toEqual(["missingColumns", "duplicateColumns", "unknownColumns"])
  })
  it("identifies row errors without accepting mismatched carton measurements or repeated products", () => {
    const result = parseCartonTable(
      [
        [...cartonColumns],
        row(),
        row(),
        ["01", "3", products[1]!.buyerSku, "5", "60", "40", "40", "12"],
        row("UNKNOWN"),
        row(products[2]!.buyerSku, "0.5")
      ],
      products
    )
    expect(result.issues.map((issue) => [issue.row, issue.code])).toEqual([
      [3, "duplicateProduct"],
      [4, "measurements"],
      [5, "sku"],
      [6, "number"]
    ])
  })
  it("bounds carton counts and checks the combined physical count", () => {
    expect(parseCartonTable([[...cartonColumns], ["a", "1001", ...row().slice(2)]], products).issues[0]?.code).toBe(
      "number"
    )
    expect(
      parseCartonTable([[...cartonColumns], ["a", "600", ...row().slice(2)], ["b", "600", ...row().slice(2)]], products)
        .issues[0]?.code
    ).toBe("limit")
  })
  it("preserves saved carton IDs and avoids collisions when increasing a group count", () => {
    const first = parseCartonTable([[...cartonColumns], row()], products).groups[0]!
    const expanded = expandCartonGroups([
      { ...first, cartonId: "A", cartonIds: ["A", "B"], count: 3 },
      { ...first, cartonId: "A-3", count: 1 }
    ])
    expect(expanded.map((carton) => carton.cartonId)).toEqual(["A", "B", "A-4", "A-3"])
  })
  it("generates a usable workbook with text SKU references and imports filled template values", async () => {
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await cartonTemplate(products))
    expect(book.getWorksheet("Products")?.getCell("A2").value).toBe(products[0]!.buyerSku)
    book.getWorksheet("Cartons")!.addRow(row())
    const result = await readCartonFile(new File([await book.xlsx.writeBuffer()], "cartons.xlsx"), products)
    expect(result.issues).toEqual([])
    expect(result.groups[0]?.cartonId).toBe("01")
  })
  it("reports unreadable files and ignores formula values", async () => {
    expect((await readCartonFile(new File(["broken"], "cartons.xlsx"), products)).issues[0]?.code).toBe("unreadable")
    const book = new ExcelJS.Workbook()
    const sheet = book.addWorksheet("Cartons")
    sheet.addRow([...cartonColumns])
    sheet.addRow(row())
    sheet.getCell("D2").value = { formula: "10+10", result: 20 }
    const result = await readCartonFile(new File([await book.xlsx.writeBuffer()], "cartons.xlsx"), products)
    expect(result.issues[0]).toMatchObject({ row: 2, code: "number" })
  })
})
