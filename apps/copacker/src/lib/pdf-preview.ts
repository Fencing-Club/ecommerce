export type PagePreview = { image: string; text: string; width: number; height: number }

// Rasterize for on-screen review only. Downloads always retain the input PDF bytes.
export async function readPdfPages(blob: Blob, isActive = () => true): Promise<PagePreview[]> {
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
      pages.push({
        image: canvas.toDataURL("image/png"),
        text: content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
        width: viewport.width,
        height: viewport.height
      })
      page.cleanup()
    }
    return pages
  } finally {
    await job.destroy()
  }
}

// Each page's text, without drawing the pages, such as to read a carrier label's tracking number.
export async function readPdfText(blob: Blob): Promise<string[]> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist")
  GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href
  const job = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
  try {
    const documentPdf = await job.promise
    const pages: string[] = []
    for (let index = 1; index <= documentPdf.numPages; index++) {
      const page = await documentPdf.getPage(index)
      const content = await page.getTextContent()
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "))
      page.cleanup()
    }
    return pages
  } finally {
    await job.destroy()
  }
}
