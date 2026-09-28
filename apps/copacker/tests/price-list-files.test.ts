import { PDFPage } from "pdf-lib"
import { describe, expect, it, vi } from "vitest"
import type { PriceList } from "../src/server/catalog-export"
import { priceListPdf } from "../src/server/price-list-files"

const list: PriceList = {
  supplier: "Zakład Szermierczy",
  title: "Épée – 2027",
  customers: ["Fencing Club"],
  adjustment: null,
  date: "September 27, 2026",
  rows: [
    {
      product: "Épée blade – ul. Przemysłowa 花剑",
      variant: "Size 5",
      sku: "EPB-5",
      currency: "USD",
      unit: "unit",
      priceMinor: 7850,
      breaks: [{ label: "10 units+", price: "$70.00" }],
      minimum: 1,
      increment: 1,
      maximum: null
    }
  ]
}

describe("price list PDF", () => {
  it("prints letters Helvetica lacks without their marks, and keeps dashes", async () => {
    const drawText = vi.spyOn(PDFPage.prototype, "drawText")
    await priceListPdf(list)
    const drawn = drawText.mock.calls.map(([text]) => text)
    drawText.mockRestore()
    expect(drawn).toContain("Zaklad Szermierczy")
    expect(drawn).toContain("Épée – 2027")
    expect(drawn).toContain("Épée blade – ul. Przemyslowa")
    // Nothing prints as a question mark, and Chinese is left out.
    expect(drawn.join("\n")).not.toMatch(/[?\p{Script=Han}]/u)
  })
})
