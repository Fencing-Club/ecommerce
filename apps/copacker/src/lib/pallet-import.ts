import { cartonList, type Pallet, palletInputSchema } from "@repo/aisle"
import {
  addInstructions,
  type FileIssue,
  matchColumns,
  readSpreadsheet,
  styleTemplateSheet
} from "./spreadsheet-import"

export const palletColumns = [
  "Pallet ID",
  "Length (cm)",
  "Width (cm)",
  "Height (cm)",
  "Weight (kg)",
  "Stacking",
  "Carton IDs"
] as const

// The Stacking column's values, as the template's list offers them.
const stackingValues = ["Stackable", "Not stackable"] as const

export type PalletImportIssue = {
  row?: number
  pallet?: string
  code:
    | FileIssue["code"]
    | "empty"
    | "number"
    | "palletId"
    | "duplicatePallet"
    | "stacking"
    | "cartons"
    | "unknownCarton"
    | "cartonTwice"
  // A column's name, or the columns a header is missing or repeats.
  value?: string
  values?: Record<string, string | number>
}
// The pallets a file holds, each with its row in the file, and the issues that stop the import.
export type PalletImportResult = {
  pallets: Pallet[]
  rows: number[]
  issues: PalletImportIssue[]
  templateMatches: boolean
}

// A pallet's cartons as a packing list writes them: IDs and runs (A1–A6, B1), split by commas (Chinese and Urdu ones
// too), semicolons, new lines or spaces. A run is two IDs of one sequence joined by a dash, and the second can leave
// out the letters (A1–6). Text that's an ID of `known`, such as 01-2, stays one ID. Each carton once, in the order
// written.
export function readCartonIds(text: string, known: ReadonlySet<string>) {
  const ids = new Map<string, string>()
  const read = (token: string) => (known.has(token.toLowerCase()) ? [token] : expandRun(token))
  for (const part of text.replaceAll(/\s*([–—-])\s*/g, "$1").split(/[,;，；、،؛\n\r]+/)) {
    const whole = part.trim()
    const run = known.has(whole.toLowerCase()) || !/\s/.test(whole) ? read(whole) : whole.split(/\s+/).flatMap(read)
    for (const id of run) {
      if (id && !ids.has(id.toLowerCase())) {
        ids.set(id.toLowerCase(), id)
      }
    }
  }
  return [...ids.values()]
}

// A run such as A1–A6, B01–B12 or C1–4 as its IDs, or the text itself when it isn't a run of up to 1,000 cartons.
function expandRun(token: string) {
  const ends = token.split(/[–—]/).length === 2 ? token.split(/[–—]/) : token.split("-")
  const first = ends.length === 2 ? ends[0]!.match(/^(.*?)(\d+)$/) : null
  const last = ends.length === 2 ? ends[1]!.match(/^(.*?)(\d+)$/) : null
  if (!first || !last || (last[1] && last[1].toLowerCase() !== first[1]!.toLowerCase())) {
    return [token]
  }
  const [, prefix = "", digits = ""] = first
  const start = Number(digits)
  const count = Number(last[2]) - start + 1
  if (count < 2 || count > 1000) {
    return [token]
  }
  return Array.from({ length: count }, (_, index) => `${prefix}${String(start + index).padStart(digits.length, "0")}`)
}

// Reads the template's rows as pallets, one to a row, against the shipment's cartons by their IDs. A row with an issue
// isn't imported. A carton on two rows is an issue on the later row, naming the pallet it's already on.
export function parsePalletTable(table: string[][], cartonIds: readonly string[]): PalletImportResult {
  const { issues: columnIssues, positions } = matchColumns(table[0] ?? [], palletColumns)
  if (columnIssues.length) {
    return { pallets: [], rows: [], issues: columnIssues, templateMatches: false }
  }
  const issues: PalletImportIssue[] = []
  const pallets: Pallet[] = []
  const shipment = new Map(cartonIds.map((id) => [id.toLowerCase(), id]))
  const known = new Set(shipment.keys())
  // Each pallet ID's row, and each carton's pallet, from the rows read so far.
  const rows = new Map<string, number>()
  const placed = new Map<string, string>()
  for (const [index, cells] of table.slice(1).entries()) {
    const row = index + 2
    const [palletId = "", ...values] = positions.map((position) => (cells[position] ?? "").trim())
    const [stackingText = "", cartonText = ""] = values.slice(4)
    if (!palletId && values.every((value) => !value)) {
      continue
    }
    const location = { row, pallet: palletId }
    if (!palletId || palletId.length > 60) {
      issues.push({ ...location, code: "palletId" })
      continue
    }
    const earlier = rows.get(palletId.toLowerCase())
    if (earlier) {
      issues.push({ ...location, code: "duplicatePallet", values: { pallet: palletId, other: earlier } })
      continue
    }
    rows.set(palletId.toLowerCase(), row)
    const rowIssues: PalletImportIssue[] = []
    const sizes = values.slice(0, 4).map((value) => (value ? Number(value) : 0))
    for (const [size, field] of (["length", "width", "height", "weight"] as const).entries()) {
      if (!palletInputSchema.shape[field].safeParse(sizes[size]).success) {
        rowIssues.push({ ...location, code: "number", value: palletColumns[size + 1] })
      }
    }
    const [length = 0, width = 0, height = 0, weight = 0] = sizes
    const stacking = stackingValues.find((option) => option.toLowerCase() === stackingText.toLowerCase())
    if (!stacking) {
      rowIssues.push({ ...location, code: "stacking" })
    }
    const ids = readCartonIds(cartonText, known)
    if (!ids.length) {
      rowIssues.push({ ...location, code: "cartons" })
    }
    const unknown = ids.filter((id) => !known.has(id.toLowerCase()))
    if (unknown.length) {
      rowIssues.push({
        ...location,
        code: "unknownCarton",
        values: { count: unknown.length, cartons: cartonList(unknown) }
      })
    }
    // Cartons an earlier row put on its pallet, by that pallet.
    const elsewhere = new Map<string, string[]>()
    for (const id of ids.filter((id) => known.has(id.toLowerCase()))) {
      const other = placed.get(id.toLowerCase())
      if (other) {
        elsewhere.set(other, [...(elsewhere.get(other) ?? []), shipment.get(id.toLowerCase())!])
      } else {
        placed.set(id.toLowerCase(), palletId)
      }
    }
    for (const [other, cartons] of elsewhere) {
      rowIssues.push({
        ...location,
        code: "cartonTwice",
        values: { pallet: other, count: cartons.length, cartons: cartonList(cartons) }
      })
    }
    issues.push(...rowIssues)
    if (!rowIssues.length && stacking) {
      pallets.push({
        palletId,
        length,
        width,
        height,
        weight,
        stackable: stacking === "Stackable",
        cartonIds: ids.map((id) => shipment.get(id.toLowerCase())!)
      })
    }
  }
  if (!pallets.length && !issues.length) {
    issues.push({ code: "empty" })
  }
  return {
    pallets,
    rows: pallets.map((pallet) => rows.get(pallet.palletId.toLowerCase())!),
    issues,
    templateMatches: true
  }
}

export async function readPalletFile(file: File, cartonIds: readonly string[]): Promise<PalletImportResult> {
  const table = await readSpreadsheet(file, "Pallets", palletColumns.length)
  return Array.isArray(table)
    ? parsePalletTable(table, cartonIds)
    : { pallets: [], rows: [], issues: [table], templateMatches: false }
}

// The pallet template: a Pallets sheet to fill, a row to a pallet, with Stacking chosen from a list, and the
// instructions in the reader's language.
export async function palletTemplate(instructionsCopy: readonly string[], rightToLeft = false) {
  const { default: ExcelJS } = await import("exceljs")
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet("Pallets")
  sheet.columns = palletColumns.map((header) => ({ header, width: header === "Carton IDs" ? 44 : 18 }))
  sheet.getColumn(1).numFmt = "@"
  sheet.getColumn(palletColumns.length).numFmt = "@"
  for (let row = 2; row <= 201; row++) {
    sheet.getCell(row, palletColumns.indexOf("Stacking") + 1).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${stackingValues.join(",")}"`],
      showErrorMessage: true
    }
  }
  styleTemplateSheet(sheet, rightToLeft)
  addInstructions(book, instructionsCopy, rightToLeft)
  return book.xlsx.writeBuffer()
}
