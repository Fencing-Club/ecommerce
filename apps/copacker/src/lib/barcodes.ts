import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader"
import readerWasm from "zxing-wasm/reader/zxing_reader.wasm?url"

// zxing-wasm loads its WebAssembly from a CDN unless told where it is. This app serves its own copy.
prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? readerWasm : prefix + path) }
})

// The values of the Code 128 barcodes in a picture of a page, the kind carriers print tracking numbers in.
export async function readCode128(image: ImageData) {
  const found = await readBarcodes(image, { formats: ["Code128"], tryHarder: true, maxNumberOfSymbols: 8 })
  return found.filter((barcode) => barcode.isValid).map((barcode) => barcode.text)
}
