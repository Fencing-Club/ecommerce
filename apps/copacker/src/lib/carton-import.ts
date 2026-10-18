import type { OrderInput } from "@repo/aisle"
import type { CellValue } from "exceljs"
import { z } from "zod"
import type { CartonGroup } from "./carton-groups"
import { csvTable } from "./csv-table"

export const cartonColumns = [
  "Carton ID",
  "Carton count",
  "Supplier SKU",
  "Quantity per carton",
  "Length (cm)",
  "Width (cm)",
  "Height (cm)",
  "Weight (kg)",
  "Product",
  "Variant",
  "Units per pack"
] as const

export type ImportIssue = {
  row?: number
  carton?: string
  code:
    | "missingColumns"
    | "duplicateColumns"
    | "unknownColumns"
    | "empty"
    | "worksheet"
    | "unreadable"
    | "number"
    | "sku"
    | "cartonId"
    | "measurements"
    | "duplicateProduct"
    | "limit"
  value?: string
}
export type CartonImportResult = { groups: CartonGroup[]; issues: ImportIssue[]; templateMatches: boolean }

const positive = z.number().finite().positive()
const quantity = positive.int().max(1000000)

// Preserve text SKUs, reject formulas instead of trusting a workbook's cached result.
function cellValue(value: CellValue): string {
  if (value === null || value === undefined) {
    return ""
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value)
  }
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("")
  }
  return ""
}

export function parseCartonTable(table: string[][], products: OrderInput["items"]): CartonImportResult {
  const header = (table[0] ?? []).map((cell) => cell.trim().toLowerCase())
  const expected = cartonColumns.map((column) => column.toLowerCase())
  const missing = cartonColumns.filter((column) => !header.includes(column.toLowerCase()))
  const duplicate = header.filter((column, index) => column && header.indexOf(column) !== index)
  const unknown = header.filter((column) => column && !expected.includes(column))
  const issues: ImportIssue[] = []
  if (missing.length) {
    issues.push({ code: "missingColumns", value: "\n" + missing.join("\n") })
  }
  if (duplicate.length) {
    issues.push({ code: "duplicateColumns", value: "\n" + [...new Set(duplicate)].join("\n") })
  }
  if (unknown.length) {
    issues.push({ code: "unknownColumns", value: "\n" + unknown.join("\n") })
  }
  if (issues.length) {
    return { groups: [], issues, templateMatches: false }
  }
  const groups = new Map<string, CartonGroup>()
  const positions = cartonColumns.map((column) => header.indexOf(column.toLowerCase()))
  for (const [index, cells] of table.slice(1).entries()) {
    if (cells.every((cell) => !cell.trim())) {
      continue
    }
    const row = index + 2
    const values = positions.map((position) => (cells[position] ?? "").trim())
    const [id = "", countText = "", sku = "", quantityText = ""] = values
    const measurementText = values.slice(4, 8)
    const [name = "", variant = "", pack = ""] = values.slice(8)
    // Prefilled product references are not cartons until packing values are entered.
    if ([id, countText, quantityText, ...measurementText].every((value) => !value)) {
      continue
    }
    const location = { row, carton: id }
    if (!id || id.length > 60) {
      issues.push({ ...location, code: "cartonId" })
      continue
    }
    const matches = products.filter(
      (item) =>
        Boolean(sku) &&
        item.supplierSku.trim() === sku &&
        (!name || item.name.trim() === name) &&
        (!variant || item.variant.trim() === variant) &&
        (!pack || String(item.piecesPerSet) === pack)
    )
    const product = matches.length === 1 ? matches[0] : undefined
    if (!product) {
      issues.push({ ...location, code: "sku", value: sku })
      continue
    }
    const count = Number(countText)
    const packs = Number(quantityText)
    const measurements = measurementText.map(Number)
    const [length = 0, width = 0, height = 0, weight = 0] = measurements
    let valid = true
    if (!positive.int().max(1000).safeParse(count).success) {
      issues.push({ ...location, code: "number", value: "Carton count" })
      valid = false
    }
    if (!quantity.safeParse(packs).success || packs * product.piecesPerSet > 1000000) {
      issues.push({ ...location, code: "number", value: "Quantity per carton" })
      valid = false
    }
    for (const [dimension, value] of measurements.entries()) {
      if (!positive.max(dimension === 3 ? 1000 : 500).safeParse(value).success) {
        issues.push({ ...location, code: "number", value: cartonColumns[dimension + 4] })
        valid = false
      }
    }
    if (!valid) {
      continue
    }
    const existing = groups.get(id.toLowerCase())
    if (existing) {
      if (
        [existing.count, existing.length, existing.width, existing.height, existing.weight].some(
          (value, i) => value !== [count, length, width, height, weight][i]
        )
      ) {
        issues.push({ ...location, code: "measurements" })
        continue
      }
      if (existing.items.some((item) => item.itemId === product.id)) {
        issues.push({ ...location, code: "duplicateProduct", value: sku })
        continue
      }
      existing.items.push({ itemId: product.id, pieces: packs * product.piecesPerSet })
    } else {
      groups.set(id.toLowerCase(), {
        cartonId: id,
        cartonIds: [],
        count,
        length,
        width,
        height,
        weight,
        items: [{ itemId: product.id, pieces: packs * product.piecesPerSet }]
      })
    }
  }
  if (!groups.size && !issues.length) {
    issues.push({ code: "empty" })
  }
  if ([...groups.values()].reduce((sum, group) => sum + group.count, 0) > 1000) {
    issues.push({ code: "limit" })
  }
  return { groups: [...groups.values()], issues, templateMatches: true }
}

export async function readCartonFile(file: File, products: OrderInput["items"]): Promise<CartonImportResult> {
  try {
    if (file.name.toLowerCase().endsWith(".csv")) {
      return parseCartonTable(csvTable((await file.text()).replace(/^\uFEFF/, "")), products)
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return { groups: [], issues: [{ code: "unreadable" }], templateMatches: false }
    }
    const { default: ExcelJS } = await import("exceljs")
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await file.arrayBuffer())
    const sheet = book.getWorksheet("Cartons")
    if (!sheet) {
      return { groups: [], issues: [{ code: "worksheet" }], templateMatches: false }
    }
    const table: string[][] = []
    sheet.eachRow((row, index) => {
      table[index - 1] = Array.from({ length: Math.max(row.cellCount, cartonColumns.length) }, (_, column) =>
        cellValue(row.getCell(column + 1).value)
      )
    })
    return parseCartonTable(
      Array.from(table, (row) => row ?? []),
      products
    )
  } catch {
    return { groups: [], issues: [{ code: "unreadable" }], templateMatches: false }
  }
}

export async function cartonTemplate(
  products: OrderInput["items"],
  instructionsCopy: readonly string[],
  rightToLeft = false
) {
  const { default: ExcelJS } = await import("exceljs")
  const book = new ExcelJS.Workbook()
  const cartons = book.addWorksheet("Cartons")
  cartons.columns = cartonColumns.map((header) => ({
    header,
    width: header === "Product" || header === "Variant" ? 36 : 22
  }))
  cartons.views = [{ state: "frozen", ySplit: 1, rightToLeft }]
  cartons.getColumn(1).numFmt = "@"
  cartons.getColumn(3).numFmt = "@"
  cartons.addRows(
    products.map((item) => ["", "", item.supplierSku, "", "", "", "", "", item.name, item.variant, item.piecesPerSet])
  )
  cartons.autoFilter = { from: { row: 1, column: 1 }, to: { row: products.length + 1, column: cartonColumns.length } }
  cartons.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
  cartons.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } }
  cartons.getRow(1).height = 30
  cartons.eachRow((row, index) => {
    row.alignment = { vertical: "middle", wrapText: true }
    if (index > 1) {
      row.height = 42
      for (const column of [3, 9, 10, 11]) {
        row.getCell(column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }
      }
    }
  })
  const instructions = book.addWorksheet("Instructions")
  instructions.views = [{ rightToLeft }]
  instructions.getColumn(1).width = 110
  for (const instruction of instructionsCopy) {
    const row = instructions.addRow([instruction])
    row.alignment = { wrapText: true, vertical: "top", readingOrder: rightToLeft ? "rtl" : "ltr" }
    row.height = 60
  }
  return book.xlsx.writeBuffer()
}
