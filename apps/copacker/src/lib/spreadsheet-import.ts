import type { CellValue, Workbook, Worksheet } from "exceljs"
import { csvTable } from "./csv-table"

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

// A template sheet's header: frozen, bold and dark, and every row wrapping its text.
export function styleTemplateSheet(sheet: Worksheet, rightToLeft: boolean) {
  sheet.views = [{ state: "frozen", ySplit: 1, rightToLeft }]
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } }
  sheet.getRow(1).height = 30
  sheet.eachRow((row) => {
    row.alignment = { vertical: "middle", wrapText: true }
  })
}

// The template's Instructions sheet, a paragraph to a row, in the reader's language.
export function addInstructions(book: Workbook, instructionsCopy: readonly string[], rightToLeft: boolean) {
  const instructions = book.addWorksheet("Instructions")
  instructions.views = [{ rightToLeft }]
  instructions.getColumn(1).width = 110
  for (const instruction of instructionsCopy) {
    const row = instructions.addRow([instruction])
    row.alignment = { wrapText: true, vertical: "top", readingOrder: rightToLeft ? "rtl" : "ltr" }
    row.height = 60
  }
}
