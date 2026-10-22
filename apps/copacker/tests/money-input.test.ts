import { describe, expect, it } from "vitest"
import { moneyText, parseMoney } from "../src/components/money-input"

describe("parseMoney", () => {
  it("reads English amounts, with a dot for cents and commas grouping thousands", () => {
    expect(parseMoney("", "en")).toBeNull()
    expect(parseMoney("  ", "en")).toBeNull()
    expect(parseMoney("78.5", "en")).toBe(7850)
    expect(parseMoney("12.", "en")).toBe(1200)
    expect(parseMoney("1,250", "en")).toBe(125000)
    expect(parseMoney("1,234,567.89", "en")).toBe(123456789)
    expect(parseMoney(" 4.25 ", "en")).toBe(425)
  })

  it("reads German amounts, with a comma for cents and dots grouping thousands", () => {
    // The bug this guards against: 12,50 in German is twelve and a half, not 1250.
    expect(parseMoney("12,50", "de")).toBe(1250)
    expect(parseMoney("78,5", "de")).toBe(7850)
    expect(parseMoney("1.250", "de")).toBe(125000)
    expect(parseMoney("1.234.567,89", "de")).toBe(123456789)
  })

  it("reads French amounts, grouped with any space", () => {
    expect(parseMoney("12,50", "fr")).toBe(1250)
    expect(parseMoney("1 250,5", "fr")).toBe(125050)
    // Intl writes a narrow no-break space; a pasted amount keeps it.
    expect(parseMoney("1 250,5", "fr")).toBe(125050)
    expect(parseMoney("1 250,5", "fr")).toBe(125050)
  })

  it("reads Hindi amounts in lakhs and crores", () => {
    expect(parseMoney("12,34,567.89", "hi")).toBe(123456789)
    expect(parseMoney("1,00,000", "hi")).toBe(10000000)
    expect(parseMoney("78.5", "hi")).toBe(7850)
  })

  it("marks text that isn't an amount, rather than guessing", () => {
    const cases: Array<[text: string, locale: string]> = [
      ["abc", "en"],
      ["12.345", "en"],
      ["-5", "en"],
      [".5", "en"],
      ["1.2.3", "en"],
      // A comma that can't be grouping, such as a decimal comma typed in English.
      ["12,50", "en"],
      ["1,2345", "en"],
      // A dot that can't be grouping, such as a decimal dot typed in German.
      ["12.50", "de"],
      ["12,345", "de"],
      ["12.50", "fr"],
      ["123456789", "en"]
    ]
    for (const [text, locale] of cases) {
      expect(parseMoney(text, locale), `${text} in ${locale}`).toBeUndefined()
    }
  })
})

describe("moneyText", () => {
  it("writes an amount to type over in the locale's decimal mark, without grouping", () => {
    expect(moneyText(null, "en")).toBe("")
    expect(moneyText(undefined, "de")).toBe("")
    expect(moneyText(7850, "en")).toBe("78.50")
    expect(moneyText(123450, "en")).toBe("1234.50")
    expect(moneyText(123450, "de")).toBe("1234,50")
    expect(moneyText(123450, "fr")).toBe("1234,50")
    expect(moneyText(12345678, "hi")).toBe("123456.78")
  })

  it("reads back as the same amount in every locale", () => {
    for (const locale of ["en", "es-MX", "fr", "de", "it", "uk", "zh-CN", "hi", "ur"]) {
      for (const minor of [0, 5, 7850, 123450, 9999999999]) {
        expect(parseMoney(moneyText(minor, locale), locale), `${minor} in ${locale}`).toBe(minor)
      }
    }
  })
})
