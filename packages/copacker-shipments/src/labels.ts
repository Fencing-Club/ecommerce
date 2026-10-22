import type { OrderInput } from "@repo/copacker-orders"
import { PDFDocument } from "pdf-lib"
import { readAwdLabelPdf } from "./awd-label-pdf"
import type { Packing } from "./index"
import { inspectShipmentZip } from "./shipment-artifacts"

// Amazon's label for one supplier carton, as a shipment keeps it: the label's number (an AWD SSCC, or an FBA box ID
// such as FBA15ABCD1234U000001), the Amazon warehouse it goes to, and the Amazon shipment it travels in.
export type CartonLabel = {
  cartonId: string
  labelNumber: string
  destinationCode: string
  amazonShipmentId: string
}

// Matches each supplier carton to one page of Amazon's AWD carton labels by SKU, FNSKU and units, and returns the file
// and page of each carton's label.
export async function matchLabels(
  files: Array<{ name: string; data: Uint8Array }>,
  order: OrderInput,
  packing: Packing
) {
  const pages = (
    await Promise.all(
      files.map(async (file) => {
        const parsed = await readAwdLabelPdf(file.data)
        return parsed.labels.map((label) => ({ ...label, file: file.name }))
      })
    )
  ).flat()
  if (
    pages.length !== packing.cartons.length ||
    new Set(pages.map((p) => p.sscc)).size !== pages.length ||
    new Set(pages.map((p) => p.destinationCode)).size !== 1
  ) {
    throw new Error("Label count, destination, or unique carton identity does not match the shipment")
  }
  const remaining = [...pages].sort((a, b) => a.sscc.localeCompare(b.sscc))
  const mapped = packing.cartons.map((carton) => {
    const content = carton.items[0]!,
      item = order.items.find((i) => i.id === content.itemId)!
    const index = remaining.findIndex(
      (p) => p.sku === item.buyerSku && p.fnsku === item.fnsku && p.quantity === content.pieces / item.piecesPerSet
    )
    if (index < 0) {
      throw new Error(`No matching Amazon label for carton ${carton.cartonId}`)
    }
    const label = remaining.splice(index, 1)[0]!
    return {
      cartonId: carton.cartonId,
      labelNumber: label.sscc,
      destinationCode: label.destinationCode,
      file: label.file,
      page: label.page
    }
  })
  return mapped
}
export async function splitPdfPages(data: Uint8Array) {
  const source = await PDFDocument.load(data)
  if (source.getPageCount() > 1000) {
    throw new Error("PDF has too many pages")
  }
  return Promise.all(
    source.getPageIndices().map(async (index) => {
      const result = await PDFDocument.create(),
        [page] = await result.copyPages(source, [index])
      result.addPage(page!)
      return { page: index + 1, data: await result.save() }
    })
  )
}
export async function unpackLabels(data: Uint8Array) {
  if (Buffer.from(data.subarray(0, 5)).toString() === "%PDF-") {
    return [{ name: "Carton labels.pdf", data }]
  }
  const entries = await inspectShipmentZip(Buffer.from(data))
  const pdfs = entries.filter((e) => e.name.toLowerCase().endsWith(".pdf"))
  if (!pdfs.length) {
    throw new Error("Amazon did not provide PDF carton labels")
  }
  return pdfs
}
