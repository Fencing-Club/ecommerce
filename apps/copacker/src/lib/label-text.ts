import type { Worker } from "tesseract.js"
import { renderPdfPage, type TextLine } from "./pdf-preview"

// The text printed on a page that's only a picture, such as a UPS label bought through Shopify, read with Tesseract in
// the browser. Its worker, core and English data are this app's own files (scripts/vite-tesseract.ts), loaded the
// first time a picture is read and kept for the rest.
let tesseract: Promise<Worker> | undefined

function startTesseract() {
  // Only the browser reads pictures, which keeps Tesseract out of the server's bundle.
  if (import.meta.env.SSR) {
    return Promise.reject(new Error("Pictures are read in the browser"))
  }
  const files = new URL(`${import.meta.env.BASE_URL}tesseract/`, window.location.href).href
  return import("tesseract.js").then(({ createWorker, OEM }) =>
    createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: `${files}worker.min.js`,
      corePath: `${files}tesseract-core-simd-lstm.wasm.js`,
      langPath: files.slice(0, -1),
      gzip: true,
      // The browser caches the files like any others, so Tesseract doesn't keep its own copy.
      cacheMethod: "none"
    })
  )
}

// Below this, a word Tesseract reads is likely the pattern of a barcode, or small print it couldn't make out, rather
// than text: printed words score 70 or more, barcodes under 40.
const confident = 50

// A page of a PDF drawn at three times its size, which Tesseract reads best, and the text on it: all of it, a line at
// a time, and each line with where it's printed. Each line keeps only the words Tesseract is confident of.
export async function readPictureText(file: Blob, page: number): Promise<{ text: string; lines: TextLine[] }> {
  tesseract ??= startTesseract()
  let worker: Worker
  try {
    worker = await tesseract
  } catch (error) {
    // A failed start, such as a dropped connection, is tried again next time.
    tesseract = undefined
    throw error
  }
  const canvas = await renderPdfPage(file, page, 3)
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true })
  const lines = (data.blocks ?? [])
    .flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
    .flatMap(({ words }): TextLine[] => {
      const kept = words.filter((word) => word.text.trim() && word.confidence >= confident)
      const [first] = kept
      if (!first) {
        return []
      }
      const top = Math.min(...kept.map((word) => word.bbox.y0))
      const bottom = Math.max(...kept.map((word) => word.bbox.y1))
      const right = Math.max(...kept.map((word) => word.bbox.x1))
      return [
        {
          text: kept.map((word) => word.text.trim()).join(" "),
          x: first.bbox.x0 / canvas.width,
          y: top / canvas.height,
          width: (right - first.bbox.x0) / canvas.width,
          height: (bottom - top) / canvas.height
        }
      ]
    })
  return { text: lines.map((line) => line.text).join("\n"), lines }
}
