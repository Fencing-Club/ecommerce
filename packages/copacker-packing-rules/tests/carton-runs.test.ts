import { describe, expect, it } from "vitest"
import { cartonList, cartonRuns, readCartonIds } from "../src/index"

// Twelve A cartons, B1 and C1.
const known = new Set([...Array.from({ length: 12 }, (_, index) => `a${index + 1}`), "b1", "c1"])

describe("carton runs", () => {
  it("splits IDs into runs of a sequence, in the order given", () => {
    expect(cartonRuns(["A1", "A2", "A3", "A5", "B1", "A09", "A10"])).toEqual([
      ["A1", "A2", "A3"],
      ["A5"],
      ["B1"],
      ["A09", "A10"]
    ])
    expect(cartonList(["B4", "B6", "D1", "D8", "D9", "D11"])).toBe("B4, B6, D1, D8–D9, D11")
  })

  it("expands runs as packing lists write them and keeps IDs it knows whole", () => {
    expect(readCartonIds("A1 – A3, A2, B1", known)).toEqual(["A1", "A2", "A3", "B1"])
    expect(readCartonIds("A1—A2\nC1 B1", known)).toEqual(["A1", "A2", "C1", "B1"])
    expect(readCartonIds("A1–A2、B1，C1؛A12", known)).toEqual(["A1", "A2", "B1", "C1", "A12"])
    expect(readCartonIds("01–03", new Set())).toEqual(["01", "02", "03"])
    expect(readCartonIds("01-2, 01-3", new Set(["01-2", "01-3"]))).toEqual(["01-2", "01-3"])
    // A run of IDs with spaces in them reads back as the export writes it.
    expect(readCartonIds("Box 1–Box 3, A1 A3–A5", new Set(["box 1", "box 2", "box 3", ...known]))).toEqual([
      "Box 1",
      "Box 2",
      "Box 3",
      "A1",
      "A3",
      "A4",
      "A5"
    ])
    // A run backwards, across letters or of more than 1,000 cartons stays as written, so it reads as unknown.
    expect(readCartonIds("A3–A1, A1–B2, A1–A2000", known)).toEqual(["A3–A1", "A1–B2", "A1–A2000"])
    expect(readCartonIds(" ,; ", known)).toEqual([])
  })

  it("knows IDs in any case", () => {
    expect(readCartonIds("A1-2, a1-3", ["A1-2", "A1-3"])).toEqual(["A1-2", "a1-3"])
  })

  it("reads a carton list back as its IDs", () => {
    const ids = ["A1", "A2", "A3", "A5", "B1", "C1"]
    expect(readCartonIds(cartonList(ids), known)).toEqual(ids)
  })
})
