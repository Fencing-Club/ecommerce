import { money } from "@repo/aisle"
import { drawableText } from "@repo/aisle/documents"
import ExcelJS from "exceljs"
import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib"
import type { PriceList } from "./catalog-export"

const volume = (row: PriceList["rows"][number]) => row.breaks.map((item) => `${item.label} ${item.price}`).join("; ")

// The price list as an Excel workbook: who it's for and when, then one row per variant under a frozen header.
export async function priceListWorkbook(list: PriceList) {
  const book = new ExcelJS.Workbook()
  book.creator = list.supplier
  const sheet = book.addWorksheet("Price list", { views: [{ state: "frozen", ySplit: 5 }] })
  sheet.columns = [
    { key: "product", width: 44 },
    { key: "variant", width: 26 },
    { key: "sku", width: 18 },
    { key: "currency", width: 10 },
    { key: "price", width: 12 },
    { key: "unit", width: 10 },
    { key: "volume", width: 36 },
    { key: "minimum", width: 12 },
    { key: "increment", width: 12 },
    { key: "maximum", width: 12 }
  ]
  sheet.getCell("A1").value = list.supplier
  sheet.getCell("A1").font = { bold: true, size: 16 }
  sheet.getCell("A2").value = `${list.title} price list`
  sheet.getCell("A2").font = { size: 12, color: { argb: "FF52525B" } }
  sheet.getCell("A3").value = [
    list.customers.length ? `Prepared for ${list.customers.join(", ")}` : null,
    `Prices as of ${list.date}`
  ]
    .filter(Boolean)
    .join(". ")
  sheet.getCell("A3").font = { color: { argb: "FF71717A" } }
  const header = sheet.getRow(5)
  header.values = [
    "Product",
    "Variant",
    "SKU",
    "Currency",
    "Price",
    "Price per",
    "Volume pricing",
    "Minimum",
    "Increment",
    "Maximum"
  ]
  header.height = 20
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } }
    cell.alignment = { vertical: "middle" }
  })
  for (const row of list.rows) {
    sheet.addRow({
      product: row.product,
      variant: row.variant ?? "",
      sku: row.sku,
      currency: row.currency,
      price: row.priceMinor === null ? "On request" : row.priceMinor / 100,
      unit: row.unit,
      volume: volume(row),
      minimum: row.minimum,
      increment: row.increment,
      maximum: row.maximum ?? ""
    })
  }
  sheet.getColumn("price").numFmt = "#,##0.00"
  sheet.getColumn("sku").numFmt = "@"
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 10 } }
  return Buffer.from(await book.xlsx.writeBuffer())
}

// The price list as a PDF to send a customer: a masthead with the supplier and the catalog, then a table of
// variants, prices and volume pricing, with page numbers.
export async function priceListPdf(list: PriceList) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${list.title} price list`)
  pdf.setAuthor(list.supplier)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.09, 0.09, 0.11)
  const muted = rgb(0.44, 0.44, 0.48)
  const rule = rgb(0.85, 0.85, 0.87)
  const [width, height] = [612, 792]
  const left = 40
  const right = width - 40
  const bottom = 56
  const columns = [
    { label: "Product", x: left, width: 210 },
    { label: "SKU", x: left + 218, width: 86 },
    { label: "Price", x: left + 390, align: "right" as const },
    { label: "Volume pricing", x: left + 402, width: 130 }
  ]
  let page = pdf.addPage([width, height])
  let y = height - 48

  const text = (
    value: string,
    x: number,
    size = 9,
    font: PDFFont = regular,
    color = ink,
    align: "left" | "right" = "left"
  ) => {
    const clean = drawableText(value, font)
    const at = align === "right" ? x - font.widthOfTextAtSize(clean, size) : x
    page.drawText(clean, { x: at, y, size, font, color })
  }
  const wrap = (value: string, font: PDFFont, size: number, max: number) => {
    const lines: string[] = []
    let line = ""
    for (const word of drawableText(value, font).split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > max && line) {
        lines.push(line)
        line = word
      } else {
        line = next
      }
    }
    return [...lines, line].filter(Boolean)
  }
  const tableHeader = () => {
    for (const column of columns) {
      text(column.label.toUpperCase(), column.x, 7.5, bold, muted, column.align)
    }
    y -= 8
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: ink })
    y -= 14
  }

  text(list.supplier, left, 16, bold)
  text("PRICE LIST", right, 16, bold, ink, "right")
  y -= 18
  text(list.title, left, 11, regular, muted)
  text(list.date, right, 9, regular, muted, "right")
  y -= 14
  if (list.customers.length) {
    for (const line of wrap(`Prepared for ${list.customers.join(", ")}`, regular, 9, right - left)) {
      text(line, left, 9, regular, muted)
      y -= 12
    }
  }
  y -= 16
  tableHeader()

  for (const row of list.rows) {
    const name = wrap(row.product, bold, 9, 210)
    const variant = row.variant ? wrap(row.variant, regular, 8.5, 210) : []
    const rules = [
      row.minimum > 1 ? `Min ${row.minimum}` : "",
      row.increment > 1 ? `In multiples of ${row.increment}` : "",
      row.maximum ? `Max ${row.maximum}` : ""
    ].filter(Boolean)
    const tiers = [
      ...row.breaks.map((item) => `${item.label} ${item.price}`),
      ...(rules.length ? [rules.join(", ")] : [])
    ]
    const tierLines = tiers.flatMap((line) => wrap(line, regular, 8.5, 130))
    const rowHeight = Math.max(name.length * 11 + variant.length * 10.5, tierLines.length * 10.5, 11) + 8
    if (y - rowHeight < bottom) {
      page = pdf.addPage([width, height])
      y = height - 48
      tableHeader()
    }
    const top = y
    for (const line of name) {
      text(line, columns[0]!.x, 9, bold)
      y -= 11
    }
    for (const line of variant) {
      text(line, columns[0]!.x, 8.5, regular, muted)
      y -= 10.5
    }
    y = top
    text(row.sku, columns[1]!.x, 8.5, regular, muted)
    text(
      row.priceMinor === null ? "On request" : `${money(row.priceMinor, row.currency)} / ${row.unit}`,
      columns[2]!.x,
      9,
      bold,
      ink,
      "right"
    )
    for (const line of tierLines) {
      text(line, columns[3]!.x, 8.5, regular, muted)
      y -= 10.5
    }
    y = top - rowHeight + 11
    page.drawLine({ start: { x: left, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.5, color: rule })
    y -= 10
  }

  const pages = pdf.getPages()
  for (const [index, current] of pages.entries()) {
    const footer = drawableText(
      `${list.supplier}, ${list.title} price list, page ${index + 1} of ${pages.length}`,
      regular
    )
    current.drawText(footer, {
      x: (width - regular.widthOfTextAtSize(footer, 8)) / 2,
      y: 30,
      size: 8,
      font: regular,
      color: muted
    })
  }
  return pdf.save()
}
