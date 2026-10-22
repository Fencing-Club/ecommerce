import { describe, expect, it } from "vitest"
import { chargeInMinorUnits, importTotals, lineTotals, priceInMinorUnits } from "../src/lib/import-totals"

const line = (pieces: number | null, pricePerPiece: string | null, sourceLineTotal: string | null = null) => ({
  pieces,
  pricePerPiece,
  sourceLineTotal
})

describe("priceInMinorUnits", () => {
  it("does not round a per-piece conversion silently", () => {
    expect(priceInMinorUnits("4.08")).toBe(408)
    expect(priceInMinorUnits("12")).toBe(1200)
    expect(() => priceInMinorUnits("2.005")).toThrow("up to 2 decimal places")
    expect(() => priceInMinorUnits("-1")).toThrow("up to 2 decimal places")
  })

  it("refuses a price over a million", () => {
    expect(priceInMinorUnits("1000000")).toBe(100000000)
    expect(() => priceInMinorUnits("1000000.01")).toThrow("Price exceeds the purchase order limit")
  })
})

describe("chargeInMinorUnits", () => {
  it("reads a discount as negative", () => {
    expect(chargeInMinorUnits("85")).toBe(8500)
    expect(chargeInMinorUnits("-20.50")).toBe(-2050)
    expect(() => chargeInMinorUnits("--5")).toThrow("up to 2 decimal places")
  })
})

describe("lineTotals", () => {
  it("is units × price beside the document's line total", () => {
    expect(lineTotals(line(120, "7.25", "900"))).toEqual({ computed: 87000, printed: 90000 })
  })

  it("leaves out what's missing or isn't an amount", () => {
    expect(lineTotals(line(null, "7.25"))).toEqual({ computed: null, printed: null })
    expect(lineTotals(line(3, "7.255", "abc"))).toEqual({ computed: null, printed: null })
  })
})

describe("importTotals", () => {
  const proposal = {
    items: [line(240, "4.25"), line(60, "14.50")],
    adjustments: [{ amount: "85" }, { amount: "-20" }],
    documentTotal: "1955"
  }

  it("adds the lines and charges, and compares them with the document's total", () => {
    expect(importTotals(proposal)).toEqual({ products: 189000, adjustments: 6500, total: 195500, difference: 0 })
    expect(importTotals({ ...proposal, documentTotal: "1975" })?.difference).toBe(-2000)
    expect(importTotals({ ...proposal, documentTotal: null })?.difference).toBeNull()
    expect(importTotals({ ...proposal, documentTotal: "about 2000" })?.difference).toBeNull()
  })

  it("waits for every line and charge rather than inventing a zero", () => {
    expect(importTotals({ ...proposal, items: [...proposal.items, line(null, "2.50")] })).toBeNull()
    expect(importTotals({ ...proposal, items: [...proposal.items, line(12, null)] })).toBeNull()
    expect(importTotals({ ...proposal, adjustments: [{ amount: null }] })).toBeNull()
    expect(importTotals({ ...proposal, adjustments: [{ amount: "5.555" }] })).toBeNull()
  })

  it("counts no charges as zero", () => {
    expect(importTotals({ ...proposal, adjustments: [] })?.adjustments).toBe(0)
  })
})
