import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"
import {
  code128B,
  code128Modules,
  code128Patterns,
  countryName,
  labelTitle,
  standardProductLabels
} from "../src/product-labels"

describe("Code 128", () => {
  it("has a well-formed symbol for every value", () => {
    expect(code128Patterns).toHaveLength(107)
    expect(new Set(code128Patterns).size).toBe(107)
    for (const [value, pattern] of code128Patterns.entries()) {
      const widths = [...pattern].map(Number)
      // Every symbol is 11 modules (the stop, 13) with even bar and odd space totals, which catches a mistyped width.
      expect(widths.reduce((sum, width) => sum + width, 0)).toBe(value === 106 ? 13 : 11)
      const bars = widths.filter((_, index) => index % 2 === 0).reduce((sum, width) => sum + width, 0)
      expect(bars % 2).toBe(0)
    }
  })

  it("encodes set B text with its start code, checksum and stop", () => {
    // Start B (104) + 55 + 73*2 + 75*3 + 73*4 + 80*5 + 69*6 + 68*7 + 73*8 + 65*9 = 3281, and 3281 mod 103 = 88.
    expect(code128B("Wikipedia")).toEqual([104, 55, 73, 75, 73, 80, 69, 68, 73, 65, 88, 106])
    const modules = code128Modules("X001ABC123")
    expect(modules.reduce((sum, width) => sum + width, 0)).toBe(11 * 12 + 13)
    expect(() => code128B("é")).toThrow("printable ASCII")
  })
})

describe("standard product labels", () => {
  it("fills one US Letter page", async () => {
    const pdf = await PDFDocument.load(
      await standardProductLabels({ code: "X001ABC123", title: labelTitle("Pro-grip glove", "6 / Left") })
    )
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 })
    expect(pdf.getTitle()).toBe("X001ABC123 product labels")
  })

  it("titles a label with the Shopify product and variant", () => {
    expect(labelTitle("Body cord", "Default Title")).toBe("Body cord")
    expect(labelTitle("Body cord", null)).toBe("Body cord")
    expect(labelTitle("Pro-Grip Fencing Glove", "10 / Left")).toBe("Pro-Grip Fencing Glove (10, Left)")
  })
})

describe("country of origin", () => {
  it("names the country Shopify records", () => {
    expect(countryName("CN")).toBe("China")
    expect(countryName("us")).toBe("United States")
    expect(countryName(null)).toBeNull()
    expect(countryName("not a country")).toBeNull()
  })
})
