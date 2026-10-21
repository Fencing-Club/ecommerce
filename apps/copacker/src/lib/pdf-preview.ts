import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"

// A run of text on a page, where it's printed, as fractions of the page's width and height from its top left.
export type TextLine = { text: string; x: number; y: number; width: number; height: number }

export type PagePreview = {
  image: string
  text: string
  // Where the page's text is printed, so a picture of it can carry text to select and copy.
  lines: TextLine[]
  width: number
  height: number
  // The values of the page's Code 128 barcodes, when it was scanned for them.
  barcodes?: string[]
}

const pdfWorker = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href

async function openPdf(blob: Blob) {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist")
  GlobalWorkerOptions.workerSrc = pdfWorker
  return getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
}

// Starts loading pdf.js, its worker and the barcode reader, so the first PDF read doesn't wait for them. They're large,
// so pages load them only when they're about to read PDFs, such as when the carrier labels dialog opens.
export function preloadPdfReading() {
  if (import.meta.env.SSR) {
    return
  }
  const ignore = () => undefined
  import("pdfjs-dist").catch(ignore)
  fetch(pdfWorker).catch(ignore)
  import("./barcodes").then(({ preloadBarcodes }) => preloadBarcodes(), ignore)
}

// Rasterize for on-screen review only. Downloads always retain the input PDF bytes. `scan` picks pages, by their text,
// whose barcodes are read too, from a picture drawn at three times the size so the bars come out sharp.
export async function readPdfPages(
  blob: Blob,
  isActive = () => true,
  scan?: (text: string) => boolean
): Promise<PagePreview[]> {
  const job = await openPdf(blob)
  const pages: PagePreview[] = []
  try {
    const documentPdf = await job.promise
    for (let index = 1; index <= documentPdf.numPages && isActive(); index++) {
      const page = await documentPdf.getPage(index)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = await render(page, 1.5)
      const { text, lines } = await readText(page)
      pages.push({
        image: canvas.toDataURL("image/png"),
        text,
        lines,
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

// One page of a PDF drawn at `scale` times its size on white, for reading what's printed on a picture of it.
export async function renderPdfPage(blob: Blob, pageNumber: number, scale: number) {
  const job = await openPdf(blob)
  try {
    const documentPdf: PDFDocumentProxy = await job.promise
    const page = await documentPdf.getPage(pageNumber)
    const canvas = await render(page, scale)
    page.cleanup()
    return canvas
  } finally {
    await job.destroy()
  }
}

async function render(page: PDFPageProxy, scale: number) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement("canvas")
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, viewport, background: "#fff" }).promise
  return canvas
}

// The page's text, a line for each run of it so a number never runs into the one beside it, and where each run is.
async function readText(page: PDFPageProxy) {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const runs = content.items.flatMap((item) => ("str" in item ? [item] : []))
  const lines = runs.flatMap(({ str, transform, width }): TextLine[] => {
    const [x = 0, baseline = 0] = viewport.convertToViewportPoint(transform[4] ?? 0, transform[5] ?? 0)
    const height = Math.hypot(transform[2] ?? 0, transform[3] ?? 0)
    return str.trim()
      ? [
          {
            text: str,
            x: x / viewport.width,
            y: (baseline - height) / viewport.height,
            width: width / viewport.width,
            height: height / viewport.height
          }
        ]
      : []
  })
  return { text: runs.map((run) => run.str).join("\n"), lines }
}

async function readBarcodes(page: PDFPageProxy) {
  // Only the browser reads barcodes, which keeps zxing's WebAssembly out of the server's bundle.
  if (import.meta.env.SSR) {
    return []
  }
  const { readCode128 } = await import("./barcodes")
  const canvas = await render(page, 3)
  const context = canvas.getContext("2d")
  return context ? readCode128(context.getImageData(0, 0, canvas.width, canvas.height)) : []
}
