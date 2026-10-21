import { PDFDocument, type PDFFont, StandardFonts, rgb } from "pdf-lib"
import { money, orderCharges, orderTotal, supplierChargeTotal, type OrderInput, type Packing } from "./index"
import type { CartonLabel } from "./labels"
import { markdownBlocks } from "./markdown"
import {
  destinationName,
  destinationRequirements,
  packingInstructions,
  itemRequirements,
  isCartonRule,
  requirementText,
  sharedPrep
} from "./requirements"
import { transportInstructions, type ShipmentTransport } from "./transport"

// "2026-12-01" as "December 1, 2026".
function longDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })
}

// Who a document is from or to, as printed on it: a name, then address and contact lines.
export type PoParty = { name: string; lines: string[] }
// The buyer heading its documents, with how to reach it for the footer.
export type DocumentBuyer = PoParty & { email?: string | null; website?: string | null }
type ShipmentEdition = { orderRevision: number; shipmentRevision: number; generated: string }
const shipmentEdition = (edition: ShipmentEdition, shipment?: string) => ({
  revision: `Order revision ${edition.orderRevision} / Shipment revision ${edition.shipmentRevision}`,
  date: `Generated ${edition.generated}`,
  shipment
})

// A line's name without Shopify's "Default Title" for a product with no options.
const lineName = (item: OrderInput["items"][number]) =>
  [item.name, item.variant && item.variant !== "Default Title" ? item.variant : ""].filter(Boolean).join(" / ")

type Column = { label: string; x: number; align?: "left" | "right"; width?: number }

// Letters whose stroke or other mark doesn't come off by decomposing them, and the hyphens (U+2010 to U+2012), bar
// (U+2015) and minus sign (U+2212) the standard fonts lack, as the characters nearest them.
const plainForms: Partial<Record<string, string>> = {
  ł: "l",
  Ł: "L",
  đ: "d",
  Đ: "D",
  ħ: "h",
  Ħ: "H",
  ı: "i",
  ŧ: "t",
  Ŧ: "T",
  œ: "oe",
  Œ: "OE",
  "\u2010": "-",
  "\u2011": "-",
  "\u2012": "-",
  "\u2015": "\u2014",
  "\u2212": "-"
}

// Each font's characters, found once per font. A standard font has those of its encoding, such as WinAnsi for Helvetica.
const fontCharacters = new WeakMap<PDFFont, ReadonlySet<string>>()
function characterSet(font: PDFFont) {
  const known = fontCharacters.get(font)
  if (known) {
    return known
  }
  const characters = new Set(font.getCharacterSet().map((code) => String.fromCodePoint(code)))
  fontCharacters.set(font, characters)
  return characters
}

// Text as the font can draw it. A character the font lacks becomes the nearest one it has: a Latin letter without its
// marks, such as "l" for "ł" and "o" for "ő", or a compatibility form's plain one, such as "1" for a full-width "１".
// Anything else, such as Chinese, becomes a space.
export function drawableText(value: string, font: PDFFont) {
  const characters = characterSet(font)
  const drawable = (text: string) => Array.from(text).every((char) => characters.has(char))
  // Composed first, so a letter typed as a base letter and a combining mark, such as "ó", stays one letter.
  return Array.from(value.normalize("NFC"), (char) => {
    if (characters.has(char)) {
      return char
    }
    // A combining mark left on its own comes off entirely.
    const plain = plainForms[char] ?? char.normalize("NFKD").replace(/\p{M}/gu, "")
    return drawable(plain) ? plain : " "
  }).join("")
}

// The layout Copacker's documents share, after Fencing Club's printed invoice: a masthead with the buyer and the
// document type over a heavy rule, a band of facts, then sections labelled in a left rail, and a footer on every page
// with the buyer's name, contact details, reference and page count.
async function documentKit(
  title: string,
  reference: string,
  buyer: DocumentBuyer,
  edition?: { revision: string; date: string; shipment?: string }
) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${title} ${reference}`)
  pdf.setAuthor(buyer.name)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique)
  type Font = typeof regular
  const ink = rgb(0, 0, 0)
  const muted = rgb(0.29, 0.29, 0.33)
  const rule = rgb(0.55, 0.55, 0.58)
  const [width, height] = [612, 792]
  const left = 43
  const right = width - 43
  const top = height - 40
  const bottom = 64
  const content = left + 96
  const trackedWidth = (value: string, size: number, font: Font, tracking: number) => {
    const text = drawableText(value, font)
    return (
      (tracking
        ? Array.from(text).reduce((sum, char) => sum + font.widthOfTextAtSize(char, size), 0)
        : font.widthOfTextAtSize(text, size)) +
      tracking * Math.max(0, text.length - 1)
    )
  }
  // Splits text into lines no wider than the given width.
  const wrap = (value: string, font: Font, size: number, max: number) => {
    const rows: string[] = []
    for (const paragraph of value.split(/\r?\n/)) {
      let row = ""
      for (const word of drawableText(paragraph, font).split(/\s+/).filter(Boolean)) {
        const next = row ? `${row} ${word}` : word
        if (font.widthOfTextAtSize(next, size) > max && row) {
          rows.push(row)
          row = word
        } else {
          row = next
        }
      }
      rows.push(row)
    }
    return rows.filter((row, index) => row || index === 0)
  }

  let page = pdf.addPage([width, height])
  const at = { y: top }
  type Style = { size?: number; font?: Font; color?: typeof ink; tracking?: number; align?: "left" | "right" }
  const draw = (value: string, x: number, style: Style = {}) => {
    const { size = 10, font = regular, color = ink, tracking = 0, align = "left" } = style
    const text = drawableText(value, font)
    let cursor = align === "right" ? x - trackedWidth(text, size, font, tracking) : x
    if (!tracking) {
      page.drawText(text, { x: cursor, y: at.y, size, font, color })
      return
    }
    for (const char of text) {
      page.drawText(char, { x: cursor, y: at.y, size, font, color })
      cursor += font.widthOfTextAtSize(char, size) + tracking
    }
  }
  const label = (value: string, x: number, align: "left" | "right" = "left") =>
    draw(value.toUpperCase(), x, { size: 8, font: bold, tracking: 1.3, align })
  const line = (from: number, to: number, y: number, thickness = 0.75, color = rule) =>
    page.drawLine({ start: { x: from, y }, end: { x: to, y }, thickness, color })
  const newPage = () => {
    page = pdf.addPage([width, height])
    at.y = top
  }
  // Starts a new page when the next block wouldn't fit. Returns whether it did.
  const ensure = (space: number) => {
    if (at.y - space < bottom) {
      newPage()
      return true
    }
    return false
  }

  type MarkdownLine = { runs: Array<{ text: string; font: Font }>; indent: number; marker?: string; gap: number }
  const markdownLines = (source: string, size: number, max: number): MarkdownLine[] => {
    const lines: MarkdownLine[] = []
    for (const block of markdownBlocks(source)) {
      // Deeply nested lists must still leave enough width for their contents.
      const indent = Math.min(block.indent * 14, max / 3)
      let row: MarkdownLine = { runs: [], indent, marker: block.marker, gap: lines.length ? 4 : 0 }
      let used = 0
      const nextLine = () => {
        lines.push(row)
        row = { runs: [], indent, gap: 0 }
        used = 0
      }
      const append = (text: string, font: Font) => {
        const previous = row.runs.at(-1)
        if (previous?.font === font) {
          previous.text += text
        } else {
          row.runs.push({ text, font })
        }
        used += font.widthOfTextAtSize(text, size)
      }
      for (const run of block.runs) {
        let font = regular
        if (run.bold && run.italic) {
          font = boldItalic
        } else if (run.bold) {
          font = bold
        } else if (run.italic) {
          font = italic
        }
        for (const token of run.text.split(/(\n|[^\S\n]+)/).filter(Boolean)) {
          if (token === "\n") {
            nextLine()
            continue
          }
          const text = drawableText(token, font)
          const space = /^\s+$/.test(text)
          const width = font.widthOfTextAtSize(text, size)
          if (used && used + width > max - indent) {
            nextLine()
          }
          if (space && !used) {
            continue
          }
          if (width <= max - indent) {
            append(text, font)
          } else {
            for (const char of text) {
              if (used && used + font.widthOfTextAtSize(char, size) > max - indent) {
                nextLine()
              }
              append(char, font)
            }
          }
        }
      }
      if (row.runs.length || row.marker) {
        lines.push(row)
      }
    }
    return lines
  }
  const drawMarkdownLine = (row: MarkdownLine, x: number, size: number, color = ink) => {
    if (row.marker) {
      draw(row.marker, x + row.indent - 4, { size, color, align: "right" })
    }
    let cursor = x + row.indent
    for (const run of row.runs) {
      draw(run.text, cursor, { size, font: run.font, color })
      cursor += run.font.widthOfTextAtSize(run.text, size)
    }
  }

  // Masthead: the buyer's name and contact lines, and the document type.
  const mastTop = at.y
  draw(buyer.name.toUpperCase(), left, { size: 13, font: bold, tracking: 1.9 })
  at.y -= 15
  for (const row of buyer.lines) {
    draw(row, left, { size: 9.5, color: muted })
    at.y -= 12
  }
  const mastBottom = at.y
  at.y = mastTop - Math.max(0, (mastTop - mastBottom - 24) / 2)
  draw(title.toUpperCase(), right, { size: 22, font: bold, tracking: 2.6, align: "right" })
  at.y = Math.min(mastBottom, at.y - 12) - 4
  line(left, right, at.y, 1.5, ink)

  const kit = {
    at,
    left,
    right,
    content,
    bold,
    regular,
    muted,
    draw,
    label,
    line,
    wrap,
    ensure,
    newPage,
    markdownLines,
    drawMarkdownLine,
    markdown(source: string, { size = 10 } = {}) {
      const rows = markdownLines(source, size, right - content)
      for (const [index, row] of rows.entries()) {
        // Keep a paragraph's first two lines together where possible.
        const space = size + 4 + row.gap
        const moved = ensure(space + (row.gap && index + 1 < rows.length ? size + 4 : 0))
        if (!moved) {
          at.y -= row.gap
        }
        drawMarkdownLine(row, content, size)
        at.y -= size + 4
      }
    },
    // A band of facts, such as the PO number and dates, divided by hairlines. The last can be shown large. A value too
    // long for its column wraps, and the band grows to fit it.
    facts(facts: Array<[string, string]>, { emphasizeLast = false } = {}) {
      const band = (right - left) / facts.length
      const bandTop = at.y
      const cells = facts.map(([name, value], index) => {
        const big = emphasizeLast && index === facts.length - 1
        const size = big ? 16 : 11.5
        return { name, big, size, rows: wrap(value, bold, size, band - 20) }
      })
      const bandHeight = 50 + Math.max(...cells.map(({ size, rows }) => (rows.length - 1) * (size + 2)))
      cells.forEach(({ name, big, size, rows }, index) => {
        const x = left + index * band + (index ? 16 : 0)
        at.y = bandTop - 20
        label(name, x)
        at.y -= big ? 19 : 16
        for (const row of rows) {
          draw(row, x, { size, font: bold })
          at.y -= size + 2
        }
        if (index) {
          page.drawLine({
            start: { x: left + index * band, y: bandTop },
            end: { x: left + index * band, y: bandTop - bandHeight },
            thickness: 0.75,
            color: rule
          })
        }
      })
      at.y = bandTop - bandHeight
      line(left, right, at.y)
    },
    // A section's label in the left rail, beside the first line of its content.
    section(name: string, gap = 20) {
      at.y -= gap
      label(name, left)
    },
    // Two blocks side by side, such as the supplier and where to ship, each a label, a name and lines.
    parties(parties: Array<[string, PoParty]>) {
      const column = (right - content) / parties.length
      const blocksTop = at.y
      let lowest = at.y
      parties.forEach(([name, party], index) => {
        const x = content + index * column
        at.y = blocksTop
        label(name, x)
        at.y -= 15
        for (const row of wrap(party.name, bold, 11, column - 20)) {
          draw(row, x, { size: 11, font: bold })
          at.y -= 13
        }
        for (const row of party.lines.flatMap((value) => wrap(value, regular, 10, column - 20))) {
          draw(row, x, { size: 10, color: muted })
          at.y -= 12.5
        }
        lowest = Math.min(lowest, at.y)
      })
      at.y = lowest - 6
    },
    // A table's header row over a heavy rule.
    tableHeader(columns: Column[]) {
      for (const column of columns) {
        label(column.label, column.x, column.align)
      }
      at.y -= 7
      line(content, right, at.y, 0.75, ink)
    },
    // Plain lines of text in the content column, each wrapped, with room checked first.
    paragraphs(rows: string[], { size = 10, check = false } = {}) {
      for (const value of rows) {
        const wrapped = wrap(value, regular, size, right - content - (check ? 16 : 0))
        ensure(Math.min(570, wrapped.length * (size + 4)))
        for (const [index, row] of wrapped.entries()) {
          ensure(size + 6)
          if (check && index === 0) {
            page.drawRectangle({
              x: content,
              y: at.y - 1,
              width: 8,
              height: 8,
              borderWidth: 0.8,
              borderColor: muted
            })
          }
          draw(row, content + (check ? 16 : 0), { size })
          at.y -= size + 4
        }
      }
    },
    // Adds every page's footer, then the finished file.
    async save() {
      const pages = pdf.getPages()
      const contact = [buyer.email, buyer.website?.replace(/^https?:\/\//, "").replace(/\/$/, "")].filter(
        (value): value is string => Boolean(value)
      )
      pages.forEach((each, index) => {
        page = each
        at.y = 40
        line(left, right, at.y + 12, 0.75, ink)
        draw(buyer.name.toUpperCase(), left, { size: 8, font: bold, tracking: 1.5 })
        let x = left + trackedWidth(buyer.name.toUpperCase(), 8, bold, 1.5) + 18
        for (const value of contact) {
          draw(value, x, { size: 8, color: muted })
          x += regular.widthOfTextAtSize(drawableText(value, regular), 8) + 18
        }
        draw(`${reference}   PAGE ${index + 1} OF ${pages.length}`, right, {
          size: 8,
          font: bold,
          tracking: 1.2,
          color: muted,
          align: "right"
        })
        if (edition) {
          at.y = 26
          draw(`${edition.revision} / ${edition.date}`, left, { size: 8, color: muted })
          if (edition.shipment) {
            at.y = 14
            draw(`Shipment ${edition.shipment}`, left, { size: 8, color: muted })
          }
        }
      })
      return pdf.save()
    }
  }
  return kit
}

// A purchase order for sending to a supplier: the buyer's details, the PO's number, dates and total, the supplier and
// where to ship, a table of the products with supplier SKUs and how to prepare them, then totals, payment terms,
// instructions and notes. Shopify's "Default Title" is left out of names, and pack sizes appear only where they matter.
export async function purchaseOrderPdf(input: {
  order: OrderInput
  revision: number
  issued: string
  buyer: DocumentBuyer
  supplier: PoParty
  shipTo?: PoParty
}) {
  const { order, revision } = input
  return orderPdf({
    title: "Purchase order",
    heading: input.buyer,
    order,
    revision,
    issued: input.issued,
    facts: [
      ["Purchase order", revision > 1 ? `${order.reference} (rev. ${revision})` : order.reference],
      ["Date", longDate(input.issued)],
      ...(order.dueDate ? [["Required by", longDate(order.dueDate)] as [string, string]] : [])
    ],
    parties: [
      ["Supplier", input.supplier],
      ["Ship to", input.shipTo ?? { name: destinationName(order), lines: [] }]
    ]
  })
}

// A commercial invoice from the supplier for a PO it agreed with the buyer: the supplier heads it, then the invoice's
// number, dates and total, who it's sold to and where it ships, and the same items, totals and terms as the PO.
export async function commercialInvoicePdf(input: {
  order: OrderInput
  revision: number
  issued: string
  supplier: DocumentBuyer
  buyer: PoParty
  shipTo?: PoParty
}) {
  const { order, revision } = input
  return orderPdf({
    title: "Commercial invoice",
    heading: input.supplier,
    order,
    revision,
    issued: input.issued,
    facts: [
      ["Invoice", revision > 1 ? `${order.reference}-${revision}` : order.reference],
      ["Date", longDate(input.issued)],
      ...(order.readyDate ? [["Ready", longDate(order.readyDate)] as [string, string]] : [])
    ],
    parties: [
      ["Sold to", input.buyer],
      ["Ship to", input.shipTo ?? { name: destinationName(order), lines: [] }]
    ]
  })
}

async function orderPdf(input: {
  title: string
  heading: DocumentBuyer
  order: OrderInput
  revision: number
  issued: string
  facts: Array<[string, string]>
  parties: Array<[string, PoParty]>
}) {
  const { order } = input
  const price = (minor: number) => money(minor, order.currency)
  const kit = await documentKit(input.title, order.reference, input.heading, {
    revision: `Order revision ${input.revision}`,
    date: `Issued ${input.issued}`
  })
  const { at, content, right, bold, regular, muted, draw, label, line, wrap, ensure } = kit
  kit.facts([...input.facts, ["Total", price(orderTotal(order))]], { emphasizeLast: true })
  kit.section("Parties")
  kit.parties(input.parties)
  line(kit.left, right, at.y)

  // Items: quantity, what it is and how to prepare it, the supplier's SKU, and prices.
  const columns = { qty: content, description: content + 34, sku: right - 262, unit: right - 96, amount: right }
  const descriptionWidth = columns.sku - 12 - columns.description
  const header = () =>
    kit.tableHeader([
      { label: "Qty", x: columns.qty },
      { label: "Description", x: columns.description },
      { label: "Supplier SKU", x: columns.sku },
      { label: "Unit price", x: columns.unit, align: "right" },
      { label: "Amount", x: columns.amount, align: "right" }
    ])
  kit.section("Items", 22)
  header()
  const prep = sharedPrep(order)
  for (const item of order.items) {
    const title = wrap(item.name, bold, 10.5, descriptionWidth)
    const variant =
      item.variant && item.variant !== "Default Title" ? wrap(item.variant, regular, 9.5, descriptionWidth) : []
    const details = [
      `SKU ${item.buyerSku}`,
      ...(item.supplierCharges ?? []).map(
        (charge) =>
          `${charge.description}: ${price(charge.amount)}${charge.basis === "flat" ? " flat" : ` per ${charge.basis}`} (${price(supplierChargeTotal(item, charge))})`
      ),
      ...itemRequirements(item, order.destination, prep)
        .filter((requirement) => requirement.code !== "instruction")
        .map(requirementText)
    ].flatMap((value) => wrap(value, regular, 8.5, descriptionWidth))
    const instructions = kit.markdownLines(packingInstructions(item), 8.5, descriptionWidth)
    const skus = item.components?.length
      ? item.components.map(
          (component) => `${component.quantity} x ${component.supplierSku || component.buyerSku || "?"}`
        )
      : [item.supplierSku || "Not set"]
    const rowHeight =
      8 +
      title.length * 12.5 +
      variant.length * 11.5 +
      details.length * 10.5 +
      instructions.reduce((sum, row) => sum + 10.5 + row.gap, 0) +
      8
    if (ensure(rowHeight + 10)) {
      at.y -= 4
      label("Items", kit.left)
      header()
    }
    at.y -= 15
    const rowTop = at.y
    draw(item.pieces.toLocaleString("en-US"), columns.qty, { size: 10.5 })
    draw(price(item.unitPrice), columns.unit, { size: 10.5, align: "right" })
    draw(price(item.pieces * item.unitPrice), columns.amount, { size: 10.5, font: bold, align: "right" })
    skus.forEach((sku, index) => {
      at.y = rowTop - index * 11.5
      draw(sku, columns.sku, { size: 9.5, color: item.supplierSku || item.components?.length ? undefined : muted })
    })
    at.y = rowTop
    for (const row of title) {
      draw(row, columns.description, { size: 10.5, font: bold })
      at.y -= 12.5
    }
    for (const row of variant) {
      draw(row, columns.description, { size: 9.5 })
      at.y -= 11.5
    }
    for (const row of details) {
      draw(row, columns.description, { size: 8.5, color: muted })
      at.y -= 10.5
    }
    at.y = Math.min(at.y, rowTop - skus.length * 11.5)
    for (const row of instructions) {
      if (ensure(12.5 + row.gap)) {
        label("Items", kit.left)
        header()
        at.y -= 15
      }
      at.y -= row.gap
      kit.drawMarkdownLine(row, columns.description, 8.5, muted)
      at.y -= 10.5
    }
    line(content, right, at.y + 2)
  }

  // Summary: the subtotal and any charges, then the total under a heavy divider.
  const adjustments = orderCharges(order)
  const summary: Array<[string, number]> = adjustments.length
    ? [
        ["Subtotal", order.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0)],
        ...adjustments.map((adjustment): [string, number] => [adjustment.description, adjustment.amount])
      ]
    : []
  ensure(summary.length * 15 + 60)
  kit.section("Summary", 22)
  for (const [name, amount] of summary) {
    draw(name, columns.unit, { size: 10.5, color: muted, align: "right" })
    draw(price(amount), columns.amount, { size: 10.5, align: "right" })
    at.y -= 15
  }
  if (summary.length) {
    line(columns.unit - 110, right, at.y + 9, 0.75)
    at.y -= 6
  }
  draw("Total", columns.unit, { size: 12, font: bold, align: "right" })
  draw(price(orderTotal(order)), columns.amount, { size: 12, font: bold, align: "right" })

  // Payment terms, instructions for the whole shipment, and the buyer's notes.
  const blocks: Array<[string, string[]]> = [
    ["Payment terms", order.paymentTerms ? [order.paymentTerms] : []],
    [
      "Instructions",
      [
        ...(prep ? [`${requirementText({ code: "prep", prep })}.`] : []),
        ...destinationRequirements(order).map(requirementText)
      ]
    ],
    ["Notes", order.notes ? [order.notes] : []]
  ]
  for (const [name, entries] of blocks) {
    if (!entries.length) {
      continue
    }
    ensure(40)
    at.y -= 12
    line(kit.left, right, at.y)
    kit.section(name, 20)
    if (name === "Notes") {
      kit.markdown(order.notes)
    } else {
      kit.paragraphs(entries)
    }
  }
  return kit.save()
}

// The packing list that travels with a shipment: each carton's size, weight, Amazon label number and contents.
export async function packingListPdf(input: {
  order: OrderInput
  packing: Packing
  labels: CartonLabel[]
  shipmentId: string
  buyer: DocumentBuyer
  shipTo?: PoParty
  transport?: ShipmentTransport | null
  bookingReference?: string | null
  edition: ShipmentEdition
}) {
  const { order, packing, labels } = input
  const kit = await documentKit(
    "Packing list",
    order.reference,
    input.buyer,
    shipmentEdition(input.edition, input.shipmentId)
  )
  const { at, content, right, bold, regular, muted, draw, line, wrap, ensure } = kit
  const pieces = packing.cartons.reduce((sum, carton) => sum + carton.items.reduce((n, item) => n + item.pieces, 0), 0)
  kit.facts([
    ["Purchase order", order.reference],
    ["Cartons", String(packing.cartons.length)],
    ["Pieces", pieces.toLocaleString("en-US")]
  ])
  kit.section("Shipment")
  kit.paragraphs([input.shipmentId])
  kit.section("Parties")
  kit.parties([
    ["From", { name: packing.origin.name, lines: originLines(packing.origin) }],
    ["Ship to", input.shipTo ?? { name: destinationName(order), lines: [] }]
  ])
  line(kit.left, right, at.y)

  // A shipment with a multi-pack line also counts each line's packs, which Amazon counts as its units.
  const packs = packing.cartons.some((carton) =>
    carton.items.some((contents) => (order.items.find((item) => item.id === contents.itemId)?.piecesPerSet ?? 1) > 1)
  )
  kit.section("Quantities")
  kit.paragraphs([
    packs
      ? "Pieces are individual products. Packs are complete sellable units; Amazon label QTY counts packs."
      : "One piece is one sellable unit."
  ])
  kit.section("Handoff")
  kit.paragraphs([
    ...transportInstructions(input.transport),
    ...(input.bookingReference ? ["Booking: " + input.bookingReference] : [])
  ])
  const columns = { item: content, units: right - (packs ? 62 : 0), packs: right }
  const itemWidth = columns.units - 38 - columns.item
  for (const carton of packing.cartons) {
    const cartonLabel = labels.find((row) => row.cartonId === carton.cartonId)
    const rowsHeight = carton.items.reduce((sum, contents) => {
      const item = order.items.find((row) => row.id === contents.itemId)
      return sum + (item ? wrap(lineName(item), bold, 10, itemWidth).length * 12 + 48 : 0)
    }, 0)
    ensure(Math.min(570, rowsHeight + 85))
    kit.section("Carton " + carton.cartonId, 22)
    draw([carton.length, carton.width, carton.height].join(" x ") + " cm    " + carton.weight + " kg", content, {
      size: 10,
      font: bold
    })
    at.y -= 16
    if (cartonLabel) {
      draw("Amazon label (SSCC / box ID): " + cartonLabel.labelNumber, content, { size: 9.5 })
      at.y -= 15
      draw("Destination: " + cartonLabel.destinationCode, content, { size: 9, color: muted })
      at.y -= 16
    }
    kit.tableHeader([
      { label: "Item", x: columns.item },
      { label: "Pieces", x: columns.units, align: "right" },
      ...(packs ? [{ label: "Packs", x: columns.packs, align: "right" as const }] : [])
    ])
    for (const contents of carton.items) {
      const item = order.items.find((row) => row.id === contents.itemId)
      if (!item) {
        continue
      }
      const title = wrap(lineName(item), bold, 10, itemWidth)
      if (ensure(title.length * 12 + 52)) {
        kit.section("Carton " + carton.cartonId, 0)
        kit.paragraphs(["Contents continued"])
      }
      at.y -= 14
      const rowTop = at.y
      draw(contents.pieces.toLocaleString("en-US"), columns.units, { size: 10, align: "right" })
      if (packs) {
        draw((contents.pieces / item.piecesPerSet).toLocaleString("en-US"), columns.packs, { size: 10, align: "right" })
      }
      at.y = rowTop
      for (const row of title) {
        draw(row, columns.item, { size: 10, font: bold })
        at.y -= 12
      }
      const supplierCodes =
        item.supplierSku ||
        item.components
          ?.map((component) => component.supplierSku)
          .filter(Boolean)
          .join(", ")
      const details = [
        "SKU: " + item.buyerSku,
        ...(supplierCodes ? ["Supplier SKU: " + supplierCodes] : []),
        ...(item.fnsku
          ? ["FNSKU: " + item.fnsku + (item.piecesPerSet > 1 ? " / " + item.piecesPerSet + " pieces per pack" : "")]
          : [])
      ]
      for (const detail of details) {
        for (const row of wrap(detail, regular, 8.5, right - content)) {
          draw(row, content, { size: 8.5, color: muted })
          at.y -= 11
        }
      }
      at.y -= 8
      line(content, right, at.y + 2)
    }
  }
  return kit.save()
}

// The supplier's checklist for packing a shipment: carton rules, how to prepare each unit, each product's own steps,
// and the final checks, each with a box to tick. Its destination is the Amazon network the cartons are packed for, or
// else the name of where they ship.
export async function checklistPdf(input: {
  shipmentId?: string
  order: OrderInput
  packing: Packing
  buyer: DocumentBuyer
  shipTo?: PoParty
  transport?: ShipmentTransport | null
  bookingReference?: string | null
  edition: ShipmentEdition
}) {
  const { order, packing } = input
  const amazon = order.destination === "amazon"
  const kit = await documentKit(
    "Packing checklist",
    order.reference,
    input.buyer,
    shipmentEdition(input.edition, input.shipmentId)
  )
  const { at, right, line } = kit
  const included = new Set(packing.cartons.flatMap((carton) => carton.items.map((item) => item.itemId)))
  const items = order.items.filter((item) => included.has(item.id))
  kit.facts([
    ["Purchase order", order.reference],
    ["Destination", (!amazon && input.shipTo?.name) || destinationName({ destination: order.destination, items })],
    ["Ready by", longDate(packing.readyDate)],
    ["Cartons", String(packing.cartons.length)]
  ])
  if (input.shipmentId) {
    kit.section("Shipment")
    kit.paragraphs([input.shipmentId])
  }
  const prep = sharedPrep({ items })
  const rules = destinationRequirements({ destination: order.destination, items })
  // Each block: its label in the rail, a heading for a product's own steps, and the steps to tick.
  const blocks: Array<{ rail: string; heading?: string; steps: string[]; instructions?: string }> = [
    {
      rail: "Cartons",
      steps: [
        ...rules.filter(isCartonRule).map(requirementText),
        "Match carton contents and quantities to the packing list."
      ]
    },
    {
      rail: "Units",
      steps: [
        ...(prep ? [`${requirementText({ code: "prep", prep })}.`] : []),
        ...rules.filter((rule) => !isCartonRule(rule)).map(requirementText)
      ]
    },
    ...items.map((item) => ({
      rail: "Product",
      heading: item.buyerSku + " / " + item.name,
      instructions: packingInstructions(item),
      steps: [
        packing.cartons.reduce(
          (sum, carton) =>
            sum +
            carton.items
              .filter((contents) => contents.itemId === item.id)
              .reduce((count, contents) => count + contents.pieces, 0),
          0
        ) /
          item.piecesPerSet +
          " product labels. One per " +
          (item.piecesPerSet > 1 ? "complete pack" : "unit") +
          ".",
        ...itemRequirements(item, order.destination, prep)
          .filter((requirement) => requirement.code !== "packFor" && requirement.code !== "instruction")
          .map(requirementText)
          .map((step) => (step.endsWith(".") ? step : step + "."))
      ]
    })),
    {
      rail: "Final checks",
      steps: [
        ...(amazon
          ? [
              "Match the SKU, quantity and SSCC / box ID to the packing list. Do not rely on PDF page order. Use each carton label once."
            ]
          : []),
        "Print product labels for the quantities listed. Print at actual size (100%) and test-scan before applying.",
        ...transportInstructions(input.transport),
        ...(input.bookingReference ? ["Booking: " + input.bookingReference] : [])
      ]
    }
  ]
  for (const block of blocks) {
    if (!block.steps.length) {
      continue
    }
    kit.ensure(44)
    kit.section(block.rail, 18)
    if (block.heading) {
      for (const row of kit.wrap(block.heading, kit.bold, 10.5, right - kit.content)) {
        kit.draw(row, kit.content, { size: 10.5, font: kit.bold })
        at.y -= 14
      }
    }
    kit.paragraphs(block.steps, { check: true })
    if (block.instructions) {
      at.y -= 4
      kit.markdown(block.instructions)
    }
    at.y -= 4
    line(kit.left, right, at.y)
  }
  return kit.save()
}

// "No. 1000, Siji Road", "Yiwu, Zhejiang 322000", "CN", "+86 180 3818 1936"
function originLines(origin: Packing["origin"]) {
  return [
    origin.addressLine1,
    origin.addressLine2,
    [origin.city, [origin.stateOrRegion, origin.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    origin.countryCode,
    origin.phoneNumber
  ].filter((value): value is string => Boolean(value))
}

export async function combinePdfs(files: Uint8Array[]) {
  const result = await PDFDocument.create()
  for (const bytes of files) {
    const source = await PDFDocument.load(bytes)
    const pages = await result.copyPages(source, source.getPageIndices())
    pages.forEach((page) => result.addPage(page))
  }
  return result.save()
}
