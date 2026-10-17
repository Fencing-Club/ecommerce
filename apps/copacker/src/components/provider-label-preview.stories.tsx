import { PDFDocument, StandardFonts } from "pdf-lib"
import { useEffect, useState } from "react"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { ProviderLabelPreview } from "./provider-label-preview"

let source: File
function Example() {
  const [file, setFile] = useState<File | null>(null)
  useEffect(() => {
    let active = true
    async function load() {
      const pdf = await PDFDocument.create()
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      const page = pdf.addPage([288, 432])
      page.drawText("Provider PDF test fixture", { x: 24, y: 380, font, size: 16 })
      page.drawText("No scannable label in this sample.", { x: 24, y: 345, font, size: 11 })
      page.drawText("4 x 6 inches / original page size", { x: 24, y: 325, font, size: 11 })
      const bytes = await pdf.save()
      if (active) {
        source = new File([new Uint8Array(bytes)], "Amazon-carton-labels-DEMO-FBA-01.pdf", { type: "application/pdf" })
        setFile(source)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])
  return file ? <ProviderLabelPreview file={file} title="Amazon carton labels" /> : <output>Loading file…</output>
}
const meta = preview.meta({
  component: Example,
  title: "Documents/Supplier packet/Original label files",
  render: () => <Example />,
  parameters: { layout: "fullscreen" }
})

export const OriginalPdf = meta.story({
  play: async ({ canvas }) => {
    const download = await canvas.findByRole("link", { name: "Download original PDF" }, { timeout: 30000 })
    const bytes = await (await fetch(download.getAttribute("href")!)).arrayBuffer()
    await expect(new Uint8Array(bytes)).toEqual(new Uint8Array(await source.arrayBuffer()))
    const file = await PDFDocument.load(bytes)
    await expect(file.getPage(0).getSize()).toEqual({ width: 288, height: 432 })
    await expect(canvas.getByRole("figure", { name: "Original PDF page 1" })).toBeVisible()
  }
})
