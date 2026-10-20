import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { palletColumns, palletTemplate, parsePalletTable, readCartonIds, readPalletFile } from "@/lib/pallet-import"

// The 07.14 shipment: twelve A cartons, B1 and C1.
const cartonIds = [...Array.from({ length: 12 }, (_, index) => `A${index + 1}`), "B1", "C1"]
const known = new Set(cartonIds.map((id) => id.toLowerCase()))
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

  it("expands runs as packing lists write them and keeps IDs it knows whole", () => {
    expect(readCartonIds("A1 – A3, A2, B1", known)).toEqual(["A1", "A2", "A3", "B1"])
    expect(readCartonIds("A1—A2\nC1 B1", known)).toEqual(["A1", "A2", "C1", "B1"])
    expect(readCartonIds("A1–A2、B1，C1؛A12", known)).toEqual(["A1", "A2", "B1", "C1", "A12"])
    expect(readCartonIds("01–03", new Set())).toEqual(["01", "02", "03"])
    expect(readCartonIds("01-2, 01-3", new Set(["01-2", "01-3"]))).toEqual(["01-2", "01-3"])
    // A run backwards, across letters or of more than 1,000 cartons stays as written, so it reads as unknown.
    expect(readCartonIds("A3–A1, A1–B2, A1–A2000", known)).toEqual(["A3–A1", "A1–B2", "A1–A2000"])
    expect(readCartonIds(" ,; ", known)).toEqual([])
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

  it("builds a template with a Stacking list and imports it filled in", async () => {
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await palletTemplate(["Eine Zeile pro Palette", "Kartons dieser Sendung: A1–A12, B1, C1."]))
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Pallets", "Instructions"])
    const sheet = book.getWorksheet("Pallets")!
    expect(sheet.getRow(1).values).toEqual([undefined, ...palletColumns])
    expect(sheet.getCell("F2").dataValidation).toMatchObject({ type: "list", formulae: ['"Stackable,Not stackable"'] })
    expect(book.getWorksheet("Instructions")?.getCell("A2").value).toBe("Kartons dieser Sendung: A1–A12, B1, C1.")
    sheet.addRow(["1", 120, 100, 75, 68.5, "Stackable", "A1–A12, B1, C1"])
    const result = await readPalletFile(new File([await book.xlsx.writeBuffer()], "pallets.xlsx"), cartonIds)
    expect(result.issues).toEqual([])
    expect(result.pallets[0]).toMatchObject({ palletId: "1", weight: 68.5, cartonIds })
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
