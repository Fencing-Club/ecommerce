import { PDFDocument, StandardFonts } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { parseAwdLabelPage } from "../src/awd-label-pdf"
import { combinePdfs } from "../src/documents"
import { splitPdfPages } from "../src/labels"
const fields = [
  "FNSKU#:",
  "MSKU#:",
  "QTY: 80",
  "X003ZURP4R",
  "body-cord-2pin-2",
  "DC: IUSP",
  "Serial Shipping Container Code (SSCC)",
  "201952611540373988"
]
describe("Amazon carton labels", () => {
  it("reads the observed Amazon SSCC layout", () => {
    const label = parseAwdLabelPage(fields, 1)
    expect(label.sscc).toBe("201952611540373988")
    expect(label.quantity).toBe(80)
  })
  it("rejects an incorrect barcode check digit", () => {
    expect(() => parseAwdLabelPage([...fields.slice(0, -1), "201952611540373989"], 1)).toThrow("check digit")
  })
  it("rejects ambiguous or unfamiliar layouts", () => {
    expect(() => parseAwdLabelPage([...fields, "Extra field"], 1)).toThrow("layout")
  })
  it("preserves label dimensions when splitting and assembling the supplier packet", async () => {
    const source = await PDFDocument.create(),
      font = await source.embedFont(StandardFonts.Helvetica)
    source.addPage([288, 432]).drawText("Carton A6", { font })
    source.addPage([612, 792]).drawText("Product label sheet", { font })
    const pages = await splitPdfPages(await source.save())
    const packet = await PDFDocument.load(await combinePdfs(pages.map((p) => p.data)))
    expect(packet.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
      [288, 432],
      [612, 792]
    ])
  })
})
