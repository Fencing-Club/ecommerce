import { describe, expect, it } from "vitest"
import { csvCell } from "@/lib/csv"

describe("CSV cells", () => {
  it("quotes values and doubles their quotes", () => {
    expect(csvCell('Harbor "Goods"')).toBe('"Harbor ""Goods"""')
  })

  it("keeps text that starts like a formula from running", () => {
    expect(csvCell('=HYPERLINK("https://example.com")')).toBe('"\'=HYPERLINK(""https://example.com"")"')
    expect(csvCell("+1+2")).toBe('"\'+1+2"')
    expect(csvCell("@SUM(A1)")).toBe('"\'@SUM(A1)"')
    expect(csvCell("-2+3")).toBe('"\'-2+3"')
  })

  it("leaves numbers as numbers", () => {
    expect(csvCell("-12")).toBe('"-12"')
    expect(csvCell("4.5")).toBe('"4.5"')
  })
})
