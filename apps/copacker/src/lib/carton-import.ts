import { cartonRuns, type OrderInput } from "@repo/aisle"
import { z } from "zod"
import { type CartonGroup, groupCartonIds } from "./carton-groups"
import {
  addGuide,
  cellNumber,
  matchColumns,
  readSpreadsheet,
  styleTemplateSheet,
  type TemplateGuide,
  type TemplateRow
} from "./spreadsheet-import"

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

export function parseCartonTable(table: string[][], products: OrderInput["items"]): CartonImportResult {
  const { issues: columnIssues, positions } = matchColumns(table[0] ?? [], cartonColumns)
  if (columnIssues.length) {
    return { groups: [], issues: columnIssues, templateMatches: false }
  }
  const issues: ImportIssue[] = []
  const groups = new Map<string, CartonGroup>()
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
  const table = await readSpreadsheet(file, "Cartons", cartonColumns.length)
  return Array.isArray(table)
    ? parseCartonTable(table, products)
    : { groups: [], issues: [table], templateMatches: false }
}

// The Example sheet's cartons: a kind of carton for each of the order's first three products, A1 as three identical
// cartons, with quantities the order has, so the example reads like the file the supplier will make and imports as it
// is. Each holds one product, as AWD cartons must; the instructions say how to pack products together.
export function cartonExample(products: OrderInput["items"]) {
  const kinds = [
    ["A1", 3, 60, 40, 40, 12.5],
    ["B1", 2, 50, 40, 30, 9],
    ["C1", 1, 40, 30, 30, 6]
  ] as const
  return products
    .map((item) => ({ item, packs: Math.floor(item.pieces / item.piecesPerSet) }))
    .filter(({ packs }) => packs > 0)
    .slice(0, kinds.length)
    .map(({ item, packs }, index) => {
      const [cartonId, cartons, length, width, height, weight] = kinds[index]!
      const count = Math.min(cartons, packs)
      return [
        cartonId,
        count,
        item.supplierSku,
        Math.min(24, Math.floor(packs / count)),
        length,
        width,
        height,
        weight,
        item.name,
        item.variant,
        item.piecesPerSet
      ]
    })
}

// A shipment's cartons as the template's rows, to export and import again: a row for each product of each kind of
// carton. A kind's cartons share a row when the import would number them back the same (A1 with a count of 3 for
// A1–A3); otherwise they go in runs, or one by one, so every carton keeps its ID. Unfinished values stay blank, for
// the import to point out.
export function cartonRows(groups: CartonGroup[], products: OrderInput["items"]): TemplateRow[] {
  const ids = groupCartonIds(groups)
  return groups.flatMap((group, index) => {
    const size = [group.length, group.width, group.height, group.weight].map(cellNumber)
    return cartonRuns(ids[index] ?? [])
      .flatMap((run) => {
        const [numbered = []] = groupCartonIds([{ ...group, cartonId: run[0]!, cartonIds: [], count: run.length }])
        return numbered.join() === run.join() ? [run] : run.map((id) => [id])
      })
      .flatMap((run) =>
        (group.items.length ? group.items : [undefined]).map((content) => {
          const product = products.find((item) => item.id === content?.itemId)
          return product && content
            ? [
                run[0]!,
                run.length,
                product.supplierSku,
                cellNumber(content.pieces / product.piecesPerSet),
                ...size,
                product.name,
                product.variant,
                product.piecesPerSet
              ]
            : [run[0]!, run.length, "", "", ...size, "", "", ""]
        })
      )
  })
}

// The carton template: a Cartons sheet with a row for each of the order's products to fill in, under the shipment's
// cartons when it's an export, the same filled in on an Example sheet, and the instructions in the reader's language,
// right to left for Urdu. The product cells are grey, to keep as they are.
export async function cartonTemplate(
  products: OrderInput["items"],
  guide: TemplateGuide,
  example: ReturnType<typeof cartonExample>,
  rightToLeft = false,
  cartons: readonly TemplateRow[] = []
) {
  const { default: ExcelJS } = await import("exceljs")
  const book = new ExcelJS.Workbook()
  const references = products.map(
    (item): TemplateRow => ["", "", item.supplierSku, "", "", "", "", "", item.name, item.variant, item.piecesPerSet]
  )
  for (const [name, rows] of [
    ["Cartons", [...cartons, ...references]],
    ["Example", example]
  ] as const) {
    const sheet = book.addWorksheet(name)
    sheet.columns = cartonColumns.map((header) => ({
      header,
      width: header === "Product" || header === "Variant" ? 36 : 22
    }))
    sheet.getColumn(1).numFmt = "@"
    sheet.getColumn(3).numFmt = "@"
    sheet.addRows([...rows])
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: cartonColumns.length } }
    styleTemplateSheet(sheet)
    sheet.eachRow((row, index) => {
      if (index > 1) {
        row.height = 42
        for (const column of [3, 9, 10, 11]) {
          row.getCell(column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }
        }
      }
    })
  }
  addGuide(book, guide, rightToLeft)
  return book.xlsx.writeBuffer()
}
