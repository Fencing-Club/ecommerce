import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader"
import readerWasm from "zxing-wasm/reader/zxing_reader.wasm?url"

// zxing-wasm loads its WebAssembly from a CDN unless told where it is. This app serves its own copy.
const overrides = {
  locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? readerWasm : prefix + path)
}
prepareZXingModule({ overrides })

// Starts fetching and compiling the WebAssembly, so the first page read doesn't wait for it. A failure here is tried
// again by that first read.
export function preloadBarcodes() {
  prepareZXingModule({ overrides, fireImmediately: true }).catch(() => undefined)
}

// The values of the Code 128 barcodes in a picture of a page, the kind carriers print tracking numbers in.
export async function readCode128(image: ImageData) {
  const found = await readBarcodes(image, { formats: ["Code128"], tryHarder: true, maxNumberOfSymbols: 8 })
  return found.filter((barcode) => barcode.isValid).map((barcode) => barcode.text)
}
