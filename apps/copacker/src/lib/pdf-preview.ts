import type { PDFPageProxy } from "pdfjs-dist"

export type PagePreview = {
  image: string
  text: string
  width: number
  height: number
  // The values of the page's Code 128 barcodes, when it was scanned for them.
  barcodes?: string[]
}

// Rasterize for on-screen review only. Downloads always retain the input PDF bytes. `scan` picks pages, by their text,
// whose barcodes are read too, from a picture drawn at three times the size so the bars come out sharp.
export async function readPdfPages(
  blob: Blob,
  isActive = () => true,
  scan?: (text: string) => boolean
): Promise<PagePreview[]> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist")
  GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href
  const job = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
  const pages: PagePreview[] = []
  try {
    const documentPdf = await job.promise
    for (let index = 1; index <= documentPdf.numPages && isActive(); index++) {
      const page = await documentPdf.getPage(index)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement("canvas")
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, viewport }).promise
      const content = await page.getTextContent()
      // A line for each run of text, so a number never runs into the one beside it.
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join("\n")
      pages.push({
        image: canvas.toDataURL("image/png"),
        text,
        width: viewport.width,
        height: viewport.height,
        ...(scan?.(text) && { barcodes: await readBarcodes(page) })
      })
      page.cleanup()
    }
    return pages
  } finally {
    await job.destroy()
  }
}

async function readBarcodes(page: PDFPageProxy) {
  const { readCode128 } = await import("./barcodes")
  const viewport = page.getViewport({ scale: 3 })
  const canvas = document.createElement("canvas")
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, viewport, background: "#fff" }).promise
  const context = canvas.getContext("2d")
  return context ? readCode128(context.getImageData(0, 0, canvas.width, canvas.height)) : []
}
