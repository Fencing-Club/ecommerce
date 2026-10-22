import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import {
  palletColumns,
  palletExample,
  palletRows,
  palletTemplate,
  parsePalletTable,
  readPalletFile
} from "@/lib/pallet-import"

// The 07.14 shipment: twelve A cartons, B1 and C1.
const cartonIds = [...Array.from({ length: 12 }, (_, index) => `A${index + 1}`), "B1", "C1"]
const row = (id: string, cartons: string, stacking = "Stackable", height = "75", weight = "68") => [
  id,
  "120",
  "100",
  height,
  weight,
  stacking,
  cartons
]

describe("pallet import", () => {
  it("reads a pallet to a row, with its cartons as IDs and runs", () => {
    const result = parsePalletTable(
      [
        [...palletColumns],
        row("1", "A1–A6"),
        ["", "", "", "", "", "", ""],
        row("2", "A7-A9, b1", "stackable", "75", "51"),
        row("3", "A10–12; C1", "Not stackable", "60", "53")
      ],
      cartonIds
    )
    expect(result.issues).toEqual([])
    expect(result.templateMatches).toBe(true)
    expect(result.rows).toEqual([2, 4, 5])
    expect(result.pallets).toEqual([
      {
        palletId: "1",
        length: 120,
        width: 100,
        height: 75,
        weight: 68,
        stackable: true,
        cartonIds: ["A1", "A2", "A3", "A4", "A5", "A6"]
      },
      expect.objectContaining({ palletId: "2", cartonIds: ["A7", "A8", "A9", "B1"], weight: 51 }),
      expect.objectContaining({ palletId: "3", cartonIds: ["A10", "A11", "A12", "C1"], stackable: false })
    ])
  })

  it("rejects missing, duplicate and unexpected columns before reading rows", () => {
    const result = parsePalletTable([["Pallet ID", "Pallet ID", "Cartons"], row("1", "A1")], cartonIds)
    expect(result.templateMatches).toBe(false)
    expect(result.pallets).toEqual([])
    expect(result.issues.map((issue) => issue.code)).toEqual(["missingColumns", "duplicateColumns", "unknownColumns"])
  })

  it("names each row's issues, the 07.15 ones among them, and imports none of those rows", () => {
    const result = parsePalletTable(
      [
        [...palletColumns],
        row("1", "A1–A6", "Yes"),
        row("2", "A6–A9, B1"),
        row("3", "A10–A12, D1"),
        row("2", "C1"),
        row("", "C1"),
        row("4", "", "Stackable", "0", "heavy"),
        row("5", "C1", "Stackable", "501", "5001")
      ],
      cartonIds
    )
    expect(result.pallets).toEqual([])
    expect(result.issues.map(({ row, pallet, code, value, values }) => ({ row, pallet, code, value, values }))).toEqual(
      [
        { row: 2, pallet: "1", code: "stacking", value: undefined, values: undefined },
        {
          row: 3,
          pallet: "2",
          code: "cartonTwice",
          value: undefined,
          values: { pallet: "1", count: 1, cartons: "A6" }
        },
        { row: 4, pallet: "3", code: "unknownCarton", value: undefined, values: { count: 1, cartons: "D1" } },
        { row: 5, pallet: "2", code: "duplicatePallet", value: undefined, values: { pallet: "2", other: 3 } },
        { row: 6, pallet: "", code: "palletId", value: undefined, values: undefined },
        { row: 7, pallet: "4", code: "number", value: "Height (cm)", values: undefined },
        { row: 7, pallet: "4", code: "number", value: "Weight (kg)", values: undefined },
        { row: 7, pallet: "4", code: "cartons", value: undefined, values: undefined },
        { row: 8, pallet: "5", code: "number", value: "Height (cm)", values: undefined },
        { row: 8, pallet: "5", code: "number", value: "Weight (kg)", values: undefined }
      ]
    )
  })

  it("groups a row's repeated cartons by the pallet they're already on", () => {
    const result = parsePalletTable(
      [[...palletColumns], row("1", "A1–A3"), row("2", "B1"), row("3", "A2–A3, B1, C1")],
      cartonIds
    )
    expect(result.issues.map((issue) => issue.values)).toEqual([
      { pallet: "1", count: 2, cartons: "A2–A3" },
      { pallet: "2", count: 1, cartons: "B1" }
    ])
  })

  it("reports a file without pallet rows", () => {
    expect(parsePalletTable([[...palletColumns], ["", "", "", "", "", "", ""]], cartonIds).issues).toEqual([
      { code: "empty" }
    ])
  })

  it("splits the shipment's cartons across the example's two pallets", () => {
    expect(palletExample(cartonIds)).toEqual([
      ["1", 120, 100, 150, 420, "Stackable", "A1–A7"],
      ["2", 120, 100, 120, 310, "Not stackable", "A8–A12, B1, C1"]
    ])
    expect(palletExample(["A1"])).toEqual([["1", 120, 100, 150, 420, "Stackable", "A1"]])
    expect(palletExample([]).map((example) => example[6])).toEqual(["A1–A6", "A7–A10, B1"])
  })

  it("builds a template with an example that imports as it is and a guide to each column", async () => {
    const example = palletExample(cartonIds)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(
      await palletTemplate(
        {
          headings: ["Spalte", "Was eintragen", "Beispiel"],
          columns: palletColumns.map((column, index) => ({
            column,
            entry: `Eintrag ${index + 1}`,
            example: example[0]![index]!
          })),
          notes: ["Eine Zeile pro Palette.", "Kartons dieser Sendung: A1–A12, B1, C1."]
        },
        example,
        true
      )
    )
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Pallets", "Example", "Instructions"])
    const sheet = book.getWorksheet("Pallets")!
    expect(sheet.actualRowCount).toBe(1)
    for (const name of ["Pallets", "Example"]) {
      const template = book.getWorksheet(name)!
      expect(template.getRow(1).values).toEqual([undefined, ...palletColumns])
      expect(template.getCell("F2").dataValidation).toMatchObject({
        type: "list",
        formulae: ['"Stackable,Not stackable"']
      })
    }
    const exampleSheet = book.getWorksheet("Example")!
    const exampleTable = exampleSheet
      .getSheetValues()
      .slice(1)
      .map((values) => (Array.isArray(values) ? values.slice(1).map((value) => String(value ?? "")) : []))
    expect(parsePalletTable(exampleTable, cartonIds)).toMatchObject({
      issues: [],
      pallets: [
        { palletId: "1", cartonIds: cartonIds.slice(0, 7) },
        { palletId: "2", stackable: false }
      ]
    })
    const guide = book.getWorksheet("Instructions")!
    expect(guide.getRow(1).values).toEqual([undefined, "Spalte", "Was eintragen", "Beispiel"])
    // Only the instructions turn right to left, and their examples keep numbers as numbers.
    expect(book.worksheets.map((each) => each.views[0]?.rightToLeft)).toEqual([false, false, true])
    expect(guide.getRow(2).values).toEqual([undefined, "Pallet ID", "Eintrag 1", "1"])
    expect(guide.getRow(3).values).toEqual([undefined, "Length (cm)", "Eintrag 2", 120])
    expect(guide.getRow(8).values).toEqual([undefined, "Carton IDs", "Eintrag 7", "A1–A7"])
    expect(guide.getCell("B11").value).toBe("Kartons dieser Sendung: A1–A12, B1, C1.")
    sheet.addRow(["1", 120, 100, 75, 68.5, "Stackable", "A1–A12, B1, C1"])
    const result = await readPalletFile(new File([await book.xlsx.writeBuffer()], "pallets.xlsx"), cartonIds)
    expect(result.issues).toEqual([])
    expect(result.pallets[0]).toMatchObject({ palletId: "1", weight: 68.5, cartonIds })
  })

  it("exports pallets that import back the same", async () => {
    const pallets = [
      {
        palletId: "1",
        length: 120,
        width: 100,
        height: 150,
        weight: 420.5,
        stackable: true,
        cartonIds: ["A1", "A2", "A3", "B1"]
      },
      { palletId: "2", length: 120, width: 100, height: Number.NaN, weight: 310, stackable: false, cartonIds: ["C1"] }
    ]
    expect(palletRows(pallets)).toEqual([
      ["1", 120, 100, 150, 420.5, "Stackable", "A1–A3, B1"],
      ["2", 120, 100, "", 310, "Not stackable", "C1"]
    ])
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(
      await palletTemplate(
        { headings: ["Column", "What to enter", "Example"], columns: [], notes: [] },
        palletExample(cartonIds),
        false,
        palletRows(pallets.slice(0, 1))
      )
    )
    const result = await readPalletFile(new File([await book.xlsx.writeBuffer()], "pallets.xlsx"), cartonIds)
    expect(result.issues).toEqual([])
    expect(result.pallets).toEqual(pallets.slice(0, 1))
  })

  it("reads CSV files and reports other files and workbooks without a Pallets sheet", async () => {
    const csv = ["﻿" + palletColumns.join(","), '1,120,100,75,68,Stackable,"A1–A6, B1"'].join("\r\n")
    const result = await readPalletFile(new File([csv], "pallets.csv"), cartonIds)
    expect(result.pallets[0]?.cartonIds).toEqual(["A1", "A2", "A3", "A4", "A5", "A6", "B1"])
    expect((await readPalletFile(new File(["broken"], "pallets.xlsx"), cartonIds)).issues).toEqual([
      { code: "unreadable" }
    ])
    expect((await readPalletFile(new File(["1"], "pallets.txt"), cartonIds)).issues).toEqual([{ code: "unreadable" }])
    const other = new ExcelJS.Workbook()
    other.addWorksheet("Cartons").addRow([...palletColumns])
    const missing = await readPalletFile(new File([await other.xlsx.writeBuffer()], "pallets.xlsx"), cartonIds)
    expect(missing).toEqual({ pallets: [], rows: [], issues: [{ code: "worksheet" }], templateMatches: false })
  })
})
