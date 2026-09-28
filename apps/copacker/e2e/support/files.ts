import { readFile } from "node:fs/promises"
import type { Download, Page } from "@playwright/test"
import ExcelJS from "exceljs"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { expect } from "../fixtures"

// A file for an upload control's setInputFiles.
export type UploadFile = { name: string; mimeType: string; buffer: Buffer }

// A plain PDF with one line of text per page, like a label sheet or an invoice a supplier scans.
export async function pdfFile(name: string, pages: string[] = ["Copacker end-to-end test"]): Promise<UploadFile> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const text of pages) {
    doc.addPage([288, 432]).drawText(text, { x: 24, y: 400, size: 14, font })
  }
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) }
}

// A 1x1 PNG, the smallest image the product photo upload accepts.
export function pngFile(name: string): UploadFile {
  const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  return { name, mimeType: "image/png", buffer: Buffer.from(pixel, "base64") }
}

export function csvFile(name: string, rows: string[][]): UploadFile {
  const text = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n")
  return { name, mimeType: "text/csv", buffer: Buffer.from(`${text}\r\n`) }
}

// Runs the action that starts a download and returns the file's suggested name and bytes.
export async function download(page: Page, start: () => Promise<unknown>) {
  const [file] = await Promise.all([page.waitForEvent("download"), start()])
  return { name: file.suggestedFilename(), bytes: await bytesOf(file) }
}

async function bytesOf(file: Download) {
  const path = await file.path()
  return readFile(path)
}

// Checks the bytes are a PDF that opens, and returns its page count.
export async function expectPdf(bytes: Buffer) {
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
  const doc = await PDFDocument.load(bytes)
  expect(doc.getPageCount()).toBeGreaterThan(0)
  return doc.getPageCount()
}

// The first worksheet's rows, as text, of an Excel workbook.
export async function xlsxRows(bytes: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  const sheet = workbook.worksheets[0]
  expect(sheet).toBeDefined()
  const rows: string[][] = []
  sheet!.eachRow((row) => {
    const values: unknown[] = Array.isArray(row.values) ? row.values.slice(1) : []
    rows.push(values.map((value) => (value === null || value === undefined ? "" : String(value))))
  })
  return rows
}
