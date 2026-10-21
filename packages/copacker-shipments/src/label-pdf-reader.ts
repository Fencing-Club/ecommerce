import { createHash } from "node:crypto"
import { z } from "zod"
/** Extract bounded PDF text locally. URLs, rendering, OCR and document scripts are not used. */
export async function readLabelPdfPages(data: Uint8Array, options: { timeoutMs?: number; signal?: AbortSignal } = {}) {
  if (!data.byteLength || data.byteLength > 32 * 1024 * 1024) {
    throw new Error("Label PDF exceeds byte limit.")
  }
  const timeout = z
    .number()
    .int()
    .min(1)
    .max(120000)
    .parse(options.timeoutMs ?? 30000)
  options.signal?.throwIfAborted()
  await import("./label-pdf-worker")
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const task = getDocument({
    data: Uint8Array.from(data),
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    stopAtErrors: true,
    disableAutoFetch: true,
    maxImageSize: 1
  })
  let timer: ReturnType<typeof setTimeout> | undefined,
    onAbort: () => void = () => undefined
  try {
    const work = async () => {
      const document = await task.promise
      if (document.numPages < 1 || document.numPages > 1000) {
        throw new Error("Label PDF page limit exceeded.")
      }
      const pages: Array<{ page: number; items: string[] }> = [],
        pageSizes: Array<{ page: number; width: number; height: number }> = []
      let characters = 0
      for (let number = 1; number <= document.numPages; number++) {
        options.signal?.throwIfAborted()
        const page = await document.getPage(number)
        try {
          const content = await page.getTextContent(),
            items = content.items.flatMap((i) => ("str" in i ? [i.str] : [])),
            length = items.reduce((n, s) => n + s.length, 0)
          characters += length
          if (length > 200000 || characters > 2000000) {
            throw new Error("Label PDF text limit exceeded.")
          }
          pages.push({ page: number, items })
          const viewport = page.getViewport({ scale: 1 })
          pageSizes.push({ page: number, width: viewport.width, height: viewport.height })
        } finally {
          page.cleanup()
        }
      }
      return { sha256: createHash("sha256").update(data).digest("hex"), pages, pageSizes }
    }
    const stopped = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error("Label PDF reading interrupted."))
      options.signal?.addEventListener("abort", onAbort, { once: true })
      timer = setTimeout(onAbort, timeout)
    })
    return await Promise.race([work(), stopped])
  } catch {
    throw new Error("Label PDF text could not be read within its limits.")
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
    options.signal?.removeEventListener("abort", onAbort)
    await task.destroy()
  }
}
