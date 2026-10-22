import type { CellValue, Workbook, Worksheet } from "exceljs"
import { csvTable } from "./csv-table"
import { downloadBlob } from "./download"
import { filenamePart } from "./filenames"

// A template row's cells: text, a number, or blank for a number not entered yet.
export type TemplateRow = (string | number)[]
export const cellNumber = (number: number) => (Number.isFinite(number) ? number : "")

// Saves a workbook named like the app's other downloads, its parts joined by dashes: "Cartons - PO38 - Shipment 1.xlsx".
export function downloadSpreadsheet(content: BlobPart, name: readonly string[]) {
  downloadBlob(
    new Blob([content], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${name.map(filenamePart).join(" - ")}.xlsx`
  )
}

// What stops a file before its rows are read: its columns, its worksheet, or the file itself.
export type FileIssue = {
  code: "missingColumns" | "duplicateColumns" | "unknownColumns" | "worksheet" | "unreadable"
  value?: string
}

// Preserve text IDs, reject formulas instead of trusting a workbook's cached result.
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

// A template's columns in any order, each once and nothing else, ignoring case. Gives each column's position in the
// header, or the issues when the header doesn't match.
export function matchColumns(header: string[], columns: readonly string[]) {
  const cells = header.map((cell) => cell.trim().toLowerCase())
  const expected = columns.map((column) => column.toLowerCase())
  const missing = columns.filter((column) => !cells.includes(column.toLowerCase()))
  const duplicate = cells.filter((column, index) => column && cells.indexOf(column) !== index)
  const unknown = cells.filter((column) => column && !expected.includes(column))
  const issues: FileIssue[] = []
  if (missing.length) {
    issues.push({ code: "missingColumns", value: "\n" + missing.join("\n") })
  }
  if (duplicate.length) {
    issues.push({ code: "duplicateColumns", value: "\n" + [...new Set(duplicate)].join("\n") })
  }
  if (unknown.length) {
    issues.push({ code: "unknownColumns", value: "\n" + unknown.join("\n") })
  }
  return { issues, positions: expected.map((column) => cells.indexOf(column)) }
}

// A CSV file, or an XLSX workbook's named worksheet, as rows of text cells, at least `width` cells to a row.
export async function readSpreadsheet(file: File, sheetName: string, width: number): Promise<string[][] | FileIssue> {
  try {
    if (file.name.toLowerCase().endsWith(".csv")) {
      return csvTable((await file.text()).replace(/^﻿/, ""))
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return { code: "unreadable" }
    }
    const { default: ExcelJS } = await import("exceljs")
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await file.arrayBuffer())
    const sheet = book.getWorksheet(sheetName)
    if (!sheet) {
      return { code: "worksheet" }
    }
    const table: string[][] = []
    sheet.eachRow((row, index) => {
      table[index - 1] = Array.from({ length: Math.max(row.cellCount, width) }, (_, column) =>
        cellValue(row.getCell(column + 1).value)
      )
    })
    return Array.from(table, (row) => row ?? [])
  } catch {
    return { code: "unreadable" }
  }
}

// A template sheet's header: frozen, bold and dark, and every row wrapping its text. Sheets of English headers and
// values stay left to right; only the instructions follow the reader's language.
export function styleTemplateSheet(sheet: Worksheet, rightToLeft = false) {
  sheet.views = [{ state: "frozen", ySplit: 1, rightToLeft }]
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } }
  sheet.getRow(1).height = 30
  sheet.eachRow((row) => {
    row.alignment = { vertical: "middle", wrapText: true }
  })
}

// A template's instructions in the reader's language: what to enter in each column, with an example from the Example
// sheet, and notes on the whole file.
export type TemplateGuide = {
  headings: readonly [column: string, entry: string, example: string]
  columns: readonly { column: string; entry: string; example: string | number }[]
  notes: readonly string[]
}

// The lines text wraps to in a column `width` characters wide, with Chinese characters twice as wide, so rows are tall
// enough without depending on the spreadsheet app to fit them. A column fits about a tenth more characters of running
// text than its width.
const wrappedLines = (text: string, width: number) =>
  Math.max(
    1,
    Math.ceil([...text].reduce((sum, char) => sum + (/[⺀-鿿豈-﫿＀-￯]/u.test(char) ? 2 : 1), 0) / (width * 1.1))
  )

// The Instructions sheet as a table, a row to a column of the template, then the notes beneath.
export function addGuide(book: Workbook, guide: TemplateGuide, rightToLeft: boolean) {
  const sheet = book.addWorksheet("Instructions")
  // The first column fits the longest header, Quantity per carton, in bold.
  const widths = [24, 64, 26]
  sheet.columns = guide.headings.map((header, index) => ({ header, width: widths[index] }))
  const add = (cells: (string | number)[]) => {
    const row = sheet.addRow(cells)
    row.height = 15 * Math.max(...cells.map((text, index) => wrappedLines(String(text), widths[index]!))) + 6
    return row
  }
  for (const { column, entry, example } of guide.columns) {
    add([column, entry, example]).getCell(1).font = { bold: true }
  }
  sheet.addRow([])
  for (const note of guide.notes) {
    add(["", note])
  }
  styleTemplateSheet(sheet, rightToLeft)
  sheet.eachRow((row, index) => {
    if (index > 1) {
      row.alignment = { vertical: "top", wrapText: true, readingOrder: rightToLeft ? "rtl" : "ltr" }
    }
  })
}
