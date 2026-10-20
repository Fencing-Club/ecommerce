import { validatePacking } from "@repo/aisle"
import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { cartonTotals, expandCartonGroups, groupCartons } from "@/lib/carton-groups"
import { cartonColumns, cartonExample, cartonTemplate, parseCartonTable, readCartonFile } from "@/lib/carton-import"
import { orderData } from "@/stories/fixtures/orders"

const products = orderData().items.map((item, index) => ({ ...item, piecesPerSet: index === 1 ? 2 : 1 }))
const row = (sku = products[0]!.supplierSku, quantity = "10") => ["01", "2", sku, quantity, "60", "40", "40", "12"]
// Instructions with a note or two, and each column's example from the first of `example`.
const guide = (notes: string[], example: (string | number)[][] = []) => ({
  headings: ["Spalte", "Was eintragen", "Beispiel"] as const,
  columns: cartonColumns.map((column, index) => ({
    column,
    entry: `Eintrag ${index + 1}`,
    example: example[0]?.[index] ?? ""
  })),
  notes
})
describe("carton import", () => {
  it("groups products, converts multipacks, and expands physical cartons without losing totals", () => {
    const result = parseCartonTable([[...cartonColumns], row(), row(products[1]!.supplierSku, "5")], products)
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
        ["01", "3", products[1]!.supplierSku, "5", "60", "40", "40", "12"],
        row("UNKNOWN"),
        row(products[2]!.supplierSku, "0.5")
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
  it("fills the example with a kind of carton for each product, within the order's quantities", () => {
    expect(cartonExample(products).map((cells) => cells.slice(0, 4))).toEqual([
      ["A1", 3, products[0]!.supplierSku, Math.min(24, Math.floor(products[0]!.pieces / 3))],
      ["B1", 2, products[1]!.supplierSku, 24],
      ["C1", 1, products[2]!.supplierSku, 24]
    ])
    // Fewer packs than cartons, and a product without a whole pack, which is left out.
    const few = [
      { ...products[0]!, pieces: 2 },
      { ...products[1]!, pieces: 1 }
    ]
    expect(cartonExample(few)).toEqual([
      ["A1", 2, few[0]!.supplierSku, 1, 60, 40, 40, 12.5, few[0]!.name, few[0]!.variant, 1]
    ])
  })
  it("generates a workbook with text SKU references, an example that imports as it is and a guide to each column", async () => {
    const example = cartonExample(products)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await cartonTemplate(products, guide(["Anleitung zum Verpacken"], example), example))
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Cartons", "Example", "Instructions"])
    expect(book.getWorksheet("Cartons")?.getCell("C2").value).toBe(products[0]!.supplierSku)
    const exampleTable = book
      .getWorksheet("Example")!
      .getSheetValues()
      .slice(1)
      .map((values) => (Array.isArray(values) ? values.slice(1).map((value) => String(value ?? "")) : []))
    const parsed = parseCartonTable(exampleTable, products)
    expect(parsed.issues).toEqual([])
    expect(parsed.groups.map((group) => group.cartonId)).toEqual(["A1", "B1", "C1"])
    expect(
      validatePacking({ ...orderData(), items: products }, { cartons: expandCartonGroups(parsed.groups), changes: [] })
        .issues
    ).toEqual([])
    const instructions = book.getWorksheet("Instructions")!
    expect(instructions.getRow(2).values).toEqual([undefined, "Carton ID", "Eintrag 1", "A1"])
    expect(instructions.getRow(3).values).toEqual([undefined, "Carton count", "Eintrag 2", 3])
    expect(instructions.getCell("B14").value).toBe("Anleitung zum Verpacken")
    book.getWorksheet("Cartons")!.addRow(row())
    const result = await readCartonFile(new File([await book.xlsx.writeBuffer()], "cartons.xlsx"), products)
    expect(result.issues).toEqual([])
    expect(result.groups[0]?.cartonId).toBe("01")
  })
  it("disambiguates supplier SKUs using the prefilled variant and rejects changed product data", () => {
    const first = products[0]!
    const variants = [first, { ...products[1]!, supplierSku: first.supplierSku }]
    const selected = variants[1]!
    const filled = [...row(first.supplierSku), selected.name, selected.variant, String(selected.piecesPerSet)]
    expect(parseCartonTable([[...cartonColumns], row(first.supplierSku)], variants).issues[0]?.code).toBe("sku")
    expect(parseCartonTable([[...cartonColumns], filled], variants).groups[0]?.items[0]?.itemId).toBe(selected.id)
    expect(parseCartonTable([[...cartonColumns], [...filled.slice(0, 10), "999"]], variants).issues[0]?.code).toBe(
      "sku"
    )
  })
  it("imports a filled localized workbook while ignoring unused product rows", async () => {
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await cartonTemplate(products, guide(["پیکنگ کی ہدایات"]), cartonExample(products), true))
    const sheet = book.getWorksheet("Cartons")!
    row().forEach((value, index) => {
      sheet.getRow(2).getCell(index + 1).value = value
    })
    // Only the instructions turn right to left; the sheets of English headers and values don't.
    expect(book.worksheets.map((each) => each.views[0]?.rightToLeft)).toEqual([false, false, true])
    const result = await readCartonFile(new File([await book.xlsx.writeBuffer()], "cartons.xlsx"), products)
    expect(result.issues).toEqual([])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.items[0]?.itemId).toBe(products[0]!.id)
  })
  it("round-trips product references with surrounding whitespace", async () => {
    const padded = products.map((item) => ({
      ...item,
      supplierSku: ` ${item.supplierSku} `,
      name: ` ${item.name} `,
      variant: ` ${item.variant} `
    }))
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await cartonTemplate(padded, guide(["Instructions"]), cartonExample(padded)))
    const sheet = book.getWorksheet("Cartons")!
    row().forEach((value, index) => {
      if (index !== 2) {
        sheet.getRow(2).getCell(index + 1).value = value
      }
    })
    const result = await readCartonFile(new File([await book.xlsx.writeBuffer()], "cartons.xlsx"), padded)
    expect(result.issues).toEqual([])
    expect(result.groups[0]?.items[0]?.itemId).toBe(padded[0]!.id)
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
