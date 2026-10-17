import type { OrderInput } from "@repo/aisle"
import type { CellValue } from "exceljs"
import { z } from "zod"
import type { CartonGroup } from "./carton-groups"
import { csvTable } from "./csv-table"

export const cartonColumns = [
  "Carton ID",
  "Carton count",
  "SKU",
  "Quantity per carton",
  "Length (cm)",
  "Width (cm)",
  "Height (cm)",
  "Weight (kg)"
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
    const [id = "", countText = "", sku = "", quantityText = "", ...measurementText] = values
    const location = { row, carton: id }
    if (!id || id.length > 60) {
      issues.push({ ...location, code: "cartonId" })
      continue
    }
    const product = products.find((item) => item.buyerSku === sku)
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

export async function cartonTemplate(products: OrderInput["items"]) {
  const { default: ExcelJS } = await import("exceljs")
  const book = new ExcelJS.Workbook()
  const cartons = book.addWorksheet("Cartons")
  cartons.columns = cartonColumns.map((header) => ({ header, width: header === "SKU" ? 24 : 22 }))
  cartons.getRow(1).font = { bold: true }
  cartons.views = [{ state: "frozen", ySplit: 1 }]
  cartons.getColumn(1).numFmt = "@"
  cartons.getColumn(3).numFmt = "@"
  const reference = book.addWorksheet("Products")
  reference.columns = [
    { header: "SKU", key: "sku", width: 26 },
    { header: "Product", key: "product", width: 40 },
    { header: "Variant", key: "variant", width: 36 },
    { header: "Units per pack", key: "pack", width: 20 }
  ]
  reference.addRows(
    products.map((item) => ({ sku: item.buyerSku, product: item.name, variant: item.variant, pack: item.piecesPerSet }))
  )
  reference.getRow(1).font = { bold: true }
  const instructions = book.addWorksheet("Instructions")
  instructions.getColumn(1).width = 110
  for (const instruction of [
    "Add one row per product in a carton. Repeat the same Carton ID for products packed together.",
    "Carton count is the number of identical cartons in that group. Repeat its count, dimensions and weight on every row.",
    "Quantity per carton counts sellable packs. For a single product, 1 means one unit. For a 2-pack, 1 means two units.",
    "Use the exact SKU from Products. Pack sizes and products cannot be changed by this import.",
    "Dimensions are in centimetres and weight is in kilograms for each carton. Keep the headers and Cartons worksheet name unchanged."
  ]) {
    instructions.addRow([instruction])
  }
  return book.xlsx.writeBuffer()
}
