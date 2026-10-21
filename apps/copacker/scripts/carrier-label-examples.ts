// Writes the example carrier label PDFs in src/stories/fixtures/carrier-labels/ from the layouts in
// src/stories/fixtures/carrier-labels.ts, with real barcodes, then reads them back as the browser does to check that
// each gives the tracking number, weight and size its stories expect. UPS labels are pictures, as Shopify's are, so
// they have no text. Run it after changing a layout: pnpm --filter copacker carrier-label-examples
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas"
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer"
import { readLabelMeasurements } from "../src/lib/label-measurements"
import { readTrackingNumber } from "../src/lib/tracking-numbers"
import {
  type ExampleLabel,
  exampleLayout,
  exampleText,
  fewLabels,
  isPicture,
  type LayoutItem,
  pageSize,
  shipmentLabels
} from "../src/stories/fixtures/carrier-labels"

const folder = path.join(import.meta.dirname, "../src/stories/fixtures/carrier-labels")
const require = createRequire(import.meta.url)
const wasm = readFileSync(require.resolve("zxing-wasm/writer/zxing_writer.wasm"))
// Where pdf.js finds Helvetica's metrics outside a browser.
const standardFontDataUrl = `${path.dirname(require.resolve("pdfjs-dist/package.json")).replaceAll("\\", "/")}/standard_fonts/`
prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) } })

type Barcode = Extract<LayoutItem, { kind: "barcode" }>
// A barcode's dark modules as rectangles in page points, a run of modules in a row at a time.
// In a picture, each module is a whole number of pixels, as a label printer's are, so the bars stay sharp.
async function modules(item: Barcode, pixel = 0) {
  const { symbol, error } = await writeBarcode(item.data, { format: item.format })
  if (error || !symbol) {
    throw new Error(`Couldn't write the ${item.format} barcode for ${item.data}: ${error}`)
  }
  const across = pixel ? Math.max(1, Math.floor(item.width / symbol.width / pixel)) * pixel : item.width / symbol.width
  const down = pixel
    ? Math.max(1, Math.floor(item.height / symbol.height / pixel)) * pixel
    : item.height / symbol.height
  const runs: Array<{ x: number; y: number; width: number; height: number }> = []
  for (let row = 0; row < symbol.height; row++) {
    let start = -1
    for (let column = 0; column <= symbol.width; column++) {
      const dark = column < symbol.width && (symbol.data[row * symbol.width + column] ?? 255) < 128
      if (dark && start < 0) {
        start = column
      } else if (!dark && start >= 0) {
        runs.push({
          x: item.x + start * across,
          y: item.y + row * down,
          width: (column - start) * across,
          height: down
        })
        start = -1
      }
    }
  }
  return runs
}

// A page with its text as text, so reading it gives the label's lines.
async function drawText(page: PDFPage, layout: LayoutItem[], fonts: { regular: PDFFont; bold: PDFFont }) {
  for (const item of layout) {
    if (item.kind === "text") {
      const font = item.bold ? fonts.bold : fonts.regular
      const width = font.widthOfTextAtSize(item.text, item.size)
      page.drawText(item.text, {
        x: item.center ? item.x - width / 2 : item.x,
        y: pageSize.height - item.y,
        size: item.size,
        font,
        color: item.white ? rgb(1, 1, 1) : rgb(0, 0, 0)
      })
    } else {
      const boxes = item.kind === "box" ? [item] : await modules(item)
      for (const box of boxes) {
        page.drawRectangle({
          x: box.x,
          y: pageSize.height - box.y - box.height,
          width: box.width,
          height: box.height,
          color: rgb(0, 0, 0)
        })
      }
    }
  }
}

// A picture of a page at twice its size, with no text to read, as UPS labels bought through Shopify are.
async function drawPicture(layout: LayoutItem[]) {
  const scale = 2
  const canvas = createCanvas(pageSize.width * scale, pageSize.height * scale)
  const context: SKRSContext2D = canvas.getContext("2d")
  context.fillStyle = "#fff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.scale(scale, scale)
  for (const item of layout) {
    context.fillStyle = item.kind === "text" && item.white ? "#fff" : "#000"
    if (item.kind === "text") {
      context.font = `${item.bold ? "bold " : ""}${item.size}px Arial`
      context.textAlign = item.center ? "center" : "left"
      context.fillText(item.text, item.x, item.y)
    } else {
      for (const box of item.kind === "box" ? [item] : await modules(item, 1 / scale)) {
        context.fillRect(box.x, box.y, box.width, box.height)
      }
    }
  }
  return canvas.toBuffer("image/png")
}

async function write(name: string, labels: ExampleLabel[]) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(name)
  pdf.setProducer("Copacker example carrier labels")
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold)
  }
  for (const label of labels) {
    const page = pdf.addPage([pageSize.width, pageSize.height])
    const layout = exampleLayout(label)
    if (isPicture(label)) {
      const picture = await pdf.embedPng(await drawPicture(layout))
      page.drawImage(picture, { x: 0, y: 0, width: pageSize.width, height: pageSize.height })
    } else {
      await drawText(page, layout, fonts)
    }
  }
  const bytes = await pdf.save()
  writeFileSync(path.join(folder, name), bytes)
  return bytes
}

// Reading a written file gives each page the tracking number, weight and size its stories expect.
async function check(name: string, labels: ExampleLabel[], bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice(), standardFontDataUrl })
  const document = await task.promise
  for (const [index, label] of labels.entries()) {
    const content = await (await document.getPage(index + 1)).getTextContent()
    const read = content.items.map((item) => ("str" in item ? item.str : "")).join("\n")
    const expected = exampleText(label)
    const got = { trackingNumber: readTrackingNumber(read), measured: readLabelMeasurements(read) }
    const wanted = { trackingNumber: readTrackingNumber(expected), measured: readLabelMeasurements(expected) }
    if (JSON.stringify(got) !== JSON.stringify(wanted)) {
      throw new Error(`${name}, page ${index + 1}: read ${JSON.stringify(got)}, expected ${JSON.stringify(wanted)}`)
    }
    if (!isPicture(label) && wanted.trackingNumber !== label.trackingNumber) {
      throw new Error(
        `${name}, page ${index + 1}: the text gives ${wanted.trackingNumber}, not ${label.trackingNumber}`
      )
    }
  }
  await task.destroy()
}

mkdirSync(folder, { recursive: true })
for (const [name, labels] of Object.entries({ ...shipmentLabels, ...fewLabels })) {
  await check(name, labels, await write(name, labels))
  process.stdout.write(`${name}: ${labels.length} ${labels.length === 1 ? "label" : "labels"}\n`)
}
