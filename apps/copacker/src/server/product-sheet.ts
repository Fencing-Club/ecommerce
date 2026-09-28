import ExcelJS from "exceljs"
import { z } from "zod"
import {
  defaultQuantityRules,
  type PriceBasis,
  type PriceBreak,
  pricingProblem,
  type QuantityRules
} from "@/lib/catalog-pricing"
import { variantLabel } from "@/lib/supplier-product"

// Copacker's product template, for CSV and Excel alike: one row per variant, like Shopify's product CSV. Rows with the
// same handle are one product, whose details come from its first row. Import matches variants by SKU.
const currencies = ["USD", "CNY", "EUR", "GBP", "CAD", "AUD"] as const
const bases: Record<string, PriceBasis> = { piece: "piece", pack: "sellable_pack", case: "case" }
const basisNames: Record<PriceBasis, string> = { piece: "piece", sellable_pack: "pack", case: "case" }
const yesNo = ["yes", "no"]

export const sheetColumns = [
  { key: "handle", header: "Handle", width: 26, note: "Rows with the same handle are one product. Required." },
  { key: "title", header: "Title", width: 40, note: "The product's name. Required on a product's first row." },
  { key: "status", header: "Status", width: 11, list: ["active", "archived"], note: "active or archived." },
  { key: "category", header: "Category", width: 18, note: "Where you file the product, such as Epee." },
  { key: "productCode", header: "Product code", width: 16, note: "Your own code for the product." },
  { key: "url", header: "Product URL", width: 30, note: "The product's page in your store." },
  { key: "description", header: "Description", width: 40, note: "What customers should know, such as add-ons." },
  ...[1, 2, 3, 4].flatMap((n) => [
    { key: `option${n}Name`, header: `Option ${n} name`, width: 16, note: `Such as Size. Leave blank for none.` },
    { key: `option${n}Value`, header: `Option ${n} value`, width: 16, note: `This variant's value, such as Large.` }
  ]),
  { key: "sku", header: "SKU", width: 18, note: "Unique for each variant. Required." },
  { key: "currency", header: "Currency", width: 10, list: [...currencies], note: currencies.join(", ") },
  { key: "price", header: "Price", width: 11, note: "Per price unit, such as 12.50. Blank for none yet." },
  { key: "priceBasis", header: "Price per", width: 10, list: ["piece", "pack", "case"], note: "piece, pack or case." },
  {
    key: "piecesPerPack",
    header: "Pieces per pack",
    width: 15,
    note: "Pieces in each sellable pack. 1 if sold singly."
  },
  { key: "packsPerCase", header: "Packs per case", width: 14, note: "Sellable packs in each case. Blank if unknown." },
  { key: "trackInventory", header: "Track inventory", width: 15, list: yesNo, note: "yes or no." },
  { key: "onHand", header: "On hand", width: 10, note: "Pieces in stock. Blank keeps the current count." },
  {
    key: "continueSelling",
    header: "Continue selling",
    width: 16,
    list: yesNo,
    note: "yes lets customers order past what's on hand."
  },
  { key: "minimum", header: "Minimum quantity", width: 17, note: "In price units. Blank for 1." },
  { key: "maximum", header: "Maximum quantity", width: 17, note: "In price units. Blank for no maximum." },
  {
    key: "increment",
    header: "Quantity increment",
    width: 18,
    note: "Customers order in multiples of it. Blank for 1."
  },
  {
    key: "priceBreaks",
    header: "Volume pricing",
    width: 24,
    note: "Quantity=price pairs, lowest quantity first, such as 50=11.00; 100=10.00"
  },
  { key: "notes", header: "Variant notes", width: 30, note: "Anything else about this variant." }
] as const satisfies ReadonlyArray<{ key: string; header: string; width: number; note: string; list?: string[] }>
export type SheetColumn = (typeof sheetColumns)[number]["key"]
export type SheetRow = Record<SheetColumn, string>

export type SheetVariant = {
  line: number
  supplierSku: string
  options: Record<string, string>
  currency: (typeof currencies)[number]
  priceMinor: number | null
  priceBasis: PriceBasis
  piecesPerSellablePack: number
  sellablePacksPerCase: number | null
  trackInventory: boolean
  onHand: number | null
  continueSelling: boolean
  quantityRules: QuantityRules
  priceBreaks: PriceBreak[]
  notes: string | null
}
export type SheetProduct = {
  line: number
  handle: string
  title: string
  active: boolean
  category: string | null
  productCode: string | null
  url: string | null
  description: string | null
  optionNames: string[]
  variants: SheetVariant[]
}

const amount = (minor: number | null) => (minor === null ? "" : (minor / 100).toFixed(2))

// A handle from a title: lowercase words joined by dashes.
function slug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "product"
  )
}

type ExportGroup = {
  title: string
  active: boolean
  category: string | null
  productCode: string | null
  url: string | null
  description: string | null
  optionNames: string[]
  variants: Array<{
    supplierSku: string
    options: Record<string, string>
    currency: string
    priceMinor: number | null
    priceBasis: string
    piecesPerSellablePack: number
    sellablePacksPerCase: number | null
    trackInventory: boolean
    onHand: number
    continueSelling: boolean
    quantityRules: QuantityRules
    priceBreaks: PriceBreak[]
    notes: string | null
  }>
}

// The template's rows for these products, each product under a handle of its own.
export function sheetRows(groups: ExportGroup[]): SheetRow[] {
  const used = new Map<string, number>()
  return groups.flatMap((group) => {
    const base = slug(group.productCode || group.title)
    const count = (used.get(base) ?? 0) + 1
    used.set(base, count)
    const handle = count === 1 ? base : `${base}-${count}`
    return group.variants.map((variant) => {
      const options = Object.fromEntries(
        [1, 2, 3, 4].flatMap((n) => {
          const name = group.optionNames[n - 1] ?? ""
          return [
            [`option${n}Name`, name],
            [`option${n}Value`, name ? (variant.options[name] ?? "") : ""]
          ]
        })
      )
      const rules = variant.quantityRules
      return {
        handle,
        title: group.title,
        status: group.active ? "active" : "archived",
        category: group.category ?? "",
        productCode: group.productCode ?? "",
        url: group.url ?? "",
        description: group.description ?? "",
        ...options,
        sku: variant.supplierSku,
        currency: variant.currency,
        price: amount(variant.priceMinor),
        priceBasis: basisNames[variant.priceBasis as PriceBasis] ?? variant.priceBasis,
        piecesPerPack: String(variant.piecesPerSellablePack),
        packsPerCase: variant.sellablePacksPerCase === null ? "" : String(variant.sellablePacksPerCase),
        trackInventory: variant.trackInventory ? "yes" : "no",
        onHand: variant.trackInventory ? String(variant.onHand) : "",
        continueSelling: variant.continueSelling ? "yes" : "no",
        minimum: rules.minimum === 1 ? "" : String(rules.minimum),
        maximum: rules.maximum === null ? "" : String(rules.maximum),
        increment: rules.increment === 1 ? "" : String(rules.increment),
        priceBreaks: variant.priceBreaks.map((row) => `${row.minimum}=${amount(row.priceMinor)}`).join("; "),
        notes: variant.notes ?? ""
      } as SheetRow
    })
  })
}

// Excel treats formula-looking text as an expression, and drops leading zeros from numeric-looking codes. A leading
// tab keeps both as text; import trims it.
function csvCell(key: SheetColumn, value: string) {
  let text = value
  if (/^\s*[=+\-@]/.test(text) || (key === "sku" && (/^0\d+$/.test(text) || /^\d{12,}$/.test(text)))) {
    text = `\t${text}`
  }
  return /[",\r\n\t]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function sheetCsv(rows: SheetRow[]) {
  const lines = [sheetColumns.map((column) => column.header).join(",")]
  for (const row of rows) {
    lines.push(sheetColumns.map((column) => csvCell(column.key, row[column.key])).join(","))
  }
  // A byte order mark tells Excel the file is UTF-8, so names like "Épée" survive.
  return `﻿${lines.join("\r\n")}\r\n`
}

const numericColumns = new Set<SheetColumn>([
  "price",
  "piecesPerPack",
  "packsPerCase",
  "onHand",
  "minimum",
  "maximum",
  "increment"
])

// The template as an Excel workbook: a Products sheet with a frozen, filterable header, dropdowns for the columns
// with fixed choices, and an Instructions sheet explaining each column.
export async function sheetWorkbook(rows: SheetRow[], workspace: string) {
  const book = new ExcelJS.Workbook()
  book.creator = workspace
  book.created = new Date()
  const sheet = book.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] })
  sheet.columns = sheetColumns.map((column) => ({ header: column.header, key: column.key, width: column.width }))
  for (const row of rows) {
    sheet.addRow(
      Object.fromEntries(
        sheetColumns.map((column) => {
          const value = row[column.key]
          return [column.key, numericColumns.has(column.key) && value !== "" ? Number(value) : value]
        })
      )
    )
  }
  const header = sheet.getRow(1)
  header.height = 22
  header.eachCell((cell, index) => {
    const column = sheetColumns[index - 1]!
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } }
    cell.alignment = { vertical: "middle" }
    cell.note = column.note
  })
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheetColumns.length } }
  const last = Math.max(rows.length + 1, 2) + 1000
  for (const [index, column] of sheetColumns.entries()) {
    const letter = sheet.getColumn(index + 1).letter
    if ("list" in column) {
      for (let row = 2; row <= last; row++) {
        sheet.getCell(`${letter}${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${column.list.join(",")}"`],
          showErrorMessage: true,
          errorTitle: column.header,
          error: `Choose ${column.list.join(", ")}`
        }
      }
    }
    if (column.key === "price") {
      sheet.getColumn(index + 1).numFmt = "0.00"
    }
    if (column.key === "sku" || column.key === "handle" || column.key === "productCode") {
      sheet.getColumn(index + 1).numFmt = "@"
    }
  }
  const help = book.addWorksheet("Instructions")
  help.columns = [
    { header: "Column", key: "header", width: 22 },
    { header: "What it holds", key: "note", width: 80 }
  ]
  help.getRow(1).font = { bold: true }
  help.addRows(sheetColumns.map((column) => ({ header: column.header, note: column.note })))
  help.addRow({})
  help.addRow({
    header: "How import works",
    note: "Variants are matched by SKU: matching SKUs are updated, new SKUs are added, and rows you leave out stay as they are."
  })
  return Buffer.from(await book.xlsx.writeBuffer())
}

// CSV text as rows of cells.
function csvTable(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (quoted || cell === "") {
        quoted = !quoted
      } else {
        throw new Error(`Unexpected quote on row ${rows.length + 1}`)
      }
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(cell)
      cell = ""
      if (char !== ",") {
        rows.push(row)
        row = []
        if (char === "\r" && text[i + 1] === "\n") {
          i++
        }
      }
    } else {
      cell += char
    }
  }
  if (quoted) {
    throw new Error("The CSV has an unclosed quote")
  }
  row.push(cell)
  rows.push(row)
  return rows
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return ""
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === "object") {
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("")
    }
    if ("text" in value) {
      return String(value.text)
    }
    if ("result" in value) {
      return cellText(value.result as ExcelJS.CellValue)
    }
    return ""
  }
  // Excel stores 12.5 as a float; money keeps two decimals.
  return typeof value === "number" && !Number.isInteger(value) ? String(Math.round(value * 100) / 100) : String(value)
}

// A spreadsheet's first sheet as rows of cells.
async function workbookTable(bytes: Uint8Array) {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  const sheet = book.getWorksheet("Products") ?? book.worksheets[0]
  if (!sheet) {
    throw new Error("The workbook has no sheets")
  }
  const rows: string[][] = []
  sheet.eachRow({ includeEmpty: true }, (row, number) => {
    const cells: string[] = []
    for (let column = 1; column <= sheet.columnCount; column++) {
      cells.push(cellText(row.getCell(column).value))
    }
    rows[number - 1] = cells
  })
  return Array.from(rows, (row) => row ?? [])
}

const maxRows = 20_000
const positive = z.coerce.number<string>().int().positive().max(2_147_483_647)

function money(value: string, line: number, what: string) {
  const text = value.trim()
  if (!text) {
    return null
  }
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(text)) {
    throw new Error(`Row ${line}: ${what} must be an amount with at most two decimals, such as 12.50`)
  }
  const [whole, fraction = ""] = text.split(".")
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
}

function count(value: string, line: number, what: string) {
  const parsed = positive.safeParse(value.trim())
  if (!parsed.success) {
    throw new Error(`Row ${line}: ${what} must be a whole number above 0`)
  }
  return parsed.data
}

function choice(value: string, options: readonly string[], line: number, what: string, fallback: string) {
  const text = (value.trim() || fallback).toLowerCase()
  const found = options.find((option) => option.toLowerCase() === text)
  if (!found) {
    throw new Error(`Row ${line}: ${what} must be ${options.join(", ")}`)
  }
  return found
}

// Reads a filled-in template, CSV or Excel, into products and their variants, checking every row. Errors name the row.
export async function readSheet(file: { name: string; bytes: Uint8Array }): Promise<SheetProduct[]> {
  const excel = file.name.toLowerCase().endsWith(".xlsx")
  const table = excel
    ? await workbookTable(file.bytes)
    : csvTable(new TextDecoder("utf-8", { fatal: true }).decode(file.bytes).replace(/^﻿/, ""))
  const header = (table.shift() ?? []).map((cell) => cell.trim().toLowerCase())
  const positions = new Map<SheetColumn, number>()
  for (const column of sheetColumns) {
    const index = header.indexOf(column.header.toLowerCase())
    if (index >= 0) {
      positions.set(column.key, index)
    }
  }
  const missing = (["handle", "title", "sku"] as const).filter((key) => !positions.has(key))
  if (missing.length) {
    throw new Error("Use the product template. Its first row names the columns, such as Handle, Title and SKU")
  }
  const rows = table
    .map((cells, index) => ({
      line: index + 2,
      get: (key: SheetColumn) => {
        const position = positions.get(key)
        return position === undefined ? "" : (cells[position] ?? "").replace(/^\t/, "").trim()
      },
      blank: cells.every((cell) => !cell.trim())
    }))
    .filter((row) => !row.blank)
  if (rows.length > maxRows) {
    throw new Error(`The file has more than ${maxRows.toLocaleString("en-US")} variants`)
  }
  const products = new Map<string, SheetProduct>()
  const skus = new Set<string>()
  for (const { line, get } of rows) {
    const handle = get("handle").toLowerCase()
    if (!handle) {
      throw new Error(`Row ${line}: add a handle`)
    }
    const sku = get("sku")
    if (!sku || sku.length > 255) {
      throw new Error(`Row ${line}: add a SKU of up to 255 characters`)
    }
    if (skus.has(sku)) {
      throw new Error(`Row ${line}: SKU ${sku} is in the file twice`)
    }
    skus.add(sku)
    let product = products.get(handle)
    if (!product) {
      const title = get("title")
      if (!title) {
        throw new Error(`Row ${line}: add a title for ${handle}`)
      }
      const url = get("url")
      if (url && !z.url().safeParse(url).success) {
        throw new Error(`Row ${line}: the product URL must start with https://`)
      }
      const optionNames = [1, 2, 3, 4].flatMap((n) => {
        const name = get(`option${n}Name` as SheetColumn)
        return name ? [name] : []
      })
      product = {
        line,
        handle,
        title: title.slice(0, 500),
        active: choice(get("status"), ["active", "archived"], line, "Status", "active") === "active",
        category: get("category") || null,
        productCode: get("productCode") || null,
        url: url || null,
        description: get("description") || null,
        optionNames,
        variants: []
      }
      products.set(handle, product)
    }
    const options: Record<string, string> = {}
    for (const [index, name] of product.optionNames.entries()) {
      const value = get(`option${index + 1}Value` as SheetColumn)
      if (!value) {
        throw new Error(`Row ${line}: add a value for ${name}`)
      }
      options[name] = value
    }
    const priceBasis = bases[choice(get("priceBasis"), Object.keys(bases), line, "Price per", "piece")]!
    const increment = get("increment") ? count(get("increment"), line, "Quantity increment") : 1
    const quantityRules = {
      increment,
      minimum: get("minimum") ? count(get("minimum"), line, "Minimum quantity") : increment,
      maximum: get("maximum") ? count(get("maximum"), line, "Maximum quantity") : null
    }
    const priceBreaks = get("priceBreaks")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [quantity, price] = part.split("=")
        if (!quantity || !price) {
          throw new Error(`Row ${line}: write volume pricing as quantity=price pairs, such as 50=11.00; 100=10.00`)
        }
        return {
          minimum: count(quantity, line, "A volume pricing quantity"),
          priceMinor: money(price, line, "A volume pricing price")!
        }
      })
    const priceMinor = money(get("price"), line, "Price")
    const problem = pricingProblem(priceMinor, priceBreaks, quantityRules)
    if (problem) {
      throw new Error(`Row ${line}: ${problem}`)
    }
    const piecesPerSellablePack = get("piecesPerPack") ? count(get("piecesPerPack"), line, "Pieces per pack") : 1
    const sellablePacksPerCase = get("packsPerCase") ? count(get("packsPerCase"), line, "Packs per case") : null
    if (sellablePacksPerCase !== null && !Number.isSafeInteger(piecesPerSellablePack * sellablePacksPerCase)) {
      throw new Error(`Row ${line}: the pack quantity is too large`)
    }
    const onHand = get("onHand")
    if (onHand && !/^-?\d{1,9}$/.test(onHand)) {
      throw new Error(`Row ${line}: On hand must be a whole number`)
    }
    product.variants.push({
      line,
      supplierSku: sku,
      options,
      currency: choice(get("currency"), currencies, line, "Currency", "USD") as SheetVariant["currency"],
      priceMinor,
      priceBasis,
      piecesPerSellablePack,
      sellablePacksPerCase,
      trackInventory: choice(get("trackInventory"), yesNo, line, "Track inventory", "no") === "yes",
      onHand: onHand ? Number(onHand) : null,
      continueSelling: choice(get("continueSelling"), yesNo, line, "Continue selling", "no") === "yes",
      quantityRules:
        quantityRules.minimum === 1 && increment === 1 && !quantityRules.maximum ? defaultQuantityRules : quantityRules,
      priceBreaks,
      notes: get("notes").slice(0, 2000) || null
    })
  }
  for (const product of products.values()) {
    const seen = new Set<string>()
    for (const variant of product.variants) {
      const key = variantLabel(variant.options, product.optionNames) ?? ""
      if (seen.has(key)) {
        throw new Error(
          product.optionNames.length
            ? `Row ${variant.line}: another variant of ${product.handle} has the same options`
            : `Row ${variant.line}: give ${product.handle} options to tell its variants apart`
        )
      }
      seen.add(key)
    }
  }
  return [...products.values()]
}
