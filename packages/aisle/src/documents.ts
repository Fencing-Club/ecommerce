import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { money, orderTotal, type OrderInput, type Packing } from "./index"
import type { CartonLabel } from "./labels"
import {
  destinationName,
  destinationRequirements,
  itemRequirements,
  prepInstructions,
  sharedPrep
} from "./requirements"

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

// A line's name without Shopify's "Default Title" for a product with no options.
const lineName = (item: OrderInput["items"][number]) =>
  [item.name, item.variant && item.variant !== "Default Title" ? item.variant : ""].filter(Boolean).join(" / ")

type Column = { label: string; x: number; align?: "left" | "right"; width?: number }

// The layout Copacker's documents share, after Fencing Club's printed invoice: a masthead with the buyer and the
// document type over a heavy rule, a band of facts, then sections labelled in a left rail, and a footer on every page
// with the buyer's name, contact details, reference and page count.
async function documentKit(title: string, reference: string, buyer: DocumentBuyer) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${title} ${reference}`)
  pdf.setAuthor(buyer.name)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
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
  const safe = (value: string) => value.replace(/[^\x20-\x7e\xa0-\xff]/g, " ")
  const trackedWidth = (value: string, size: number, font: Font, tracking: number) =>
    font.widthOfTextAtSize(safe(value), size) + tracking * Math.max(0, safe(value).length - 1)
  // Splits text into lines no wider than the given width.
  const wrap = (value: string, font: Font, size: number, max: number) => {
    const rows: string[] = []
    for (const paragraph of value.split(/\r?\n/)) {
      let row = ""
      for (const word of safe(paragraph).split(/\s+/).filter(Boolean)) {
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
    const text = safe(value)
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
    // A band of facts, such as the PO number and dates, divided by hairlines. The last can be shown large.
    facts(facts: Array<[string, string]>, { emphasizeLast = false } = {}) {
      const band = (right - left) / facts.length
      const bandTop = at.y
      facts.forEach(([name, value], index) => {
        const x = left + index * band + (index ? 16 : 0)
        const big = emphasizeLast && index === facts.length - 1
        at.y = bandTop - 20
        label(name, x)
        at.y -= big ? 19 : 16
        for (const row of wrap(value, bold, big ? 16 : 11.5, band - 20).slice(0, 1)) {
          draw(row, x, { size: big ? 16 : 11.5, font: bold })
        }
        if (index) {
          page.drawLine({
            start: { x: left + index * band, y: bandTop },
            end: { x: left + index * band, y: bandTop - 50 },
            thickness: 0.75,
            color: rule
          })
        }
      })
      at.y = bandTop - 50
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
      for (const row of rows.flatMap((value) => wrap(value, regular, size, right - content - (check ? 16 : 0)))) {
        ensure(size + 6)
        if (check) {
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
          x += regular.widthOfTextAtSize(safe(value), 8) + 18
        }
        draw(`${reference}   PAGE ${index + 1} OF ${pages.length}`, right, {
          size: 8,
          font: bold,
          tracking: 1.2,
          color: muted,
          align: "right"
        })
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
  const { order, revision, buyer, supplier } = input
  const price = (minor: number) => money(minor, order.currency)
  const kit = await documentKit("Purchase order", order.reference, buyer)
  const { at, content, right, bold, regular, muted, draw, label, line, wrap, ensure } = kit
  kit.facts(
    [
      ["PO number", revision > 1 ? `${order.reference} (rev. ${revision})` : order.reference],
      ["Date", longDate(input.issued)],
      ...(order.dueDate ? [["Required by", longDate(order.dueDate)] as [string, string]] : []),
      ["Total", price(orderTotal(order))]
    ],
    { emphasizeLast: true }
  )
  kit.section("Parties")
  kit.parties([
    ["Supplier", supplier],
    ["Ship to", input.shipTo ?? { name: destinationName(order), lines: [] }]
  ])
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
    const details = [`SKU ${item.buyerSku}`, ...itemRequirements(item, order.destination, prep)].flatMap((value) =>
      wrap(value, regular, 8.5, descriptionWidth)
    )
    const skus = item.components?.length
      ? item.components.map(
          (component) => `${component.quantity} x ${component.supplierSku || component.buyerSku || "?"}`
        )
      : [item.supplierSku || "Not set"]
    const rowHeight = 8 + title.length * 12.5 + variant.length * 11.5 + details.length * 10.5 + 8
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
    line(content, right, at.y + 2)
  }

  // Summary: the subtotal and any charges, then the total under a heavy divider.
  const adjustments = order.adjustments ?? []
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
    ["Instructions", [...(prep ? [`${prepInstructions[prep]}.`] : []), ...destinationRequirements(order)]],
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
    kit.paragraphs(entries)
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
}) {
  const { order, packing, labels } = input
  const kit = await documentKit("Packing list", order.reference, input.buyer)
  const { at, content, right, bold, regular, muted, draw, line, wrap, ensure } = kit
  const pieces = packing.cartons.reduce((sum, carton) => sum + carton.items.reduce((n, item) => n + item.pieces, 0), 0)
  kit.facts([
    ["PO number", order.reference],
    ["Shipment", input.shipmentId.length > 16 ? input.shipmentId.slice(0, 8).toUpperCase() : input.shipmentId],
    ["Ready by", longDate(packing.readyDate)],
    ["Cartons", `${packing.cartons.length}, ${pieces.toLocaleString("en-US")} pieces`]
  ])
  kit.section("Parties")
  kit.parties([
    ["From", { name: packing.origin.name, lines: originLines(packing.origin) }],
    ["Ship to", input.shipTo ?? { name: destinationName(order), lines: [] }]
  ])
  line(kit.left, right, at.y)

  const columns = { item: content, sku: right - 190, pieces: right - 70, units: right }
  const itemWidth = columns.sku - 12 - columns.item
  for (const carton of packing.cartons) {
    const labelNumber = labels.find((row) => row.cartonId === carton.cartonId)?.labelNumber
    ensure(80)
    kit.section(`Carton ${carton.cartonId}`, 22)
    draw(
      [
        `${carton.length} x ${carton.width} x ${carton.height} cm`,
        `${carton.weight} kg`,
        labelNumber ? `Amazon label ${labelNumber}` : ""
      ]
        .filter(Boolean)
        .join("    "),
      content,
      { size: 10, font: bold }
    )
    at.y -= 16
    kit.tableHeader([
      { label: "Item", x: columns.item },
      { label: "Supplier SKU", x: columns.sku },
      { label: "Pieces", x: columns.pieces, align: "right" },
      { label: "Units", x: columns.units, align: "right" }
    ])
    for (const contents of carton.items) {
      const item = order.items.find((row) => row.id === contents.itemId)
      if (!item) {
        continue
      }
      const title = wrap(lineName(item), bold, 10, itemWidth)
      ensure(title.length * 12 + 26)
      at.y -= 14
      const rowTop = at.y
      draw(item.supplierSku || (item.components?.length ? "See components" : "Not set"), columns.sku, {
        size: 9.5,
        color: item.supplierSku ? undefined : muted
      })
      draw(contents.pieces.toLocaleString("en-US"), columns.pieces, { size: 10, align: "right" })
      draw((contents.pieces / item.piecesPerSet).toLocaleString("en-US"), columns.units, { size: 10, align: "right" })
      at.y = rowTop
      for (const row of title) {
        draw(row, columns.item, { size: 10, font: bold })
        at.y -= 12
      }
      draw(`SKU ${item.buyerSku}${item.fnsku ? `, FNSKU ${item.fnsku}` : ""}`, columns.item, {
        size: 8.5,
        font: regular,
        color: muted
      })
      at.y -= 8
      line(content, right, at.y + 2)
    }
  }
  return kit.save()
}

// The supplier's checklist for packing a shipment: carton rules, how to prepare each unit, each product's own steps,
// and the final checks, each with a box to tick.
export async function checklistPdf(input: { order: OrderInput; packing: Packing; buyer: DocumentBuyer }) {
  const { order, packing } = input
  const amazon = order.destination === "amazon"
  const kit = await documentKit("Packing checklist", order.reference, input.buyer)
  const { at, right, line } = kit
  const included = new Set(packing.cartons.flatMap((carton) => carton.items.map((item) => item.itemId)))
  const items = order.items.filter((item) => included.has(item.id))
  kit.facts([
    ["PO number", order.reference],
    ["Destination", destinationName({ destination: order.destination, items })],
    ["Ready by", longDate(packing.readyDate)],
    ["Cartons", String(packing.cartons.length)]
  ])
  const prep = sharedPrep({ items })
  const rules = destinationRequirements({ destination: order.destination, items })
  // Each block: its label in the rail, a heading for a product's own steps, and the steps to tick.
  const blocks: Array<{ rail: string; heading?: string; steps: string[] }> = [
    {
      rail: "Cartons",
      steps: [
        ...rules.filter((rule) => /carton/i.test(rule)),
        "Match carton contents and quantities to the packing list."
      ]
    },
    {
      rail: "Units",
      steps: [...(prep ? [`${prepInstructions[prep]}.`] : []), ...rules.filter((rule) => !/carton/i.test(rule))]
    },
    ...items.map((item) => ({
      rail: "Product",
      heading: lineName(item),
      steps: itemRequirements(item, order.destination, prep).map((step) => (step.endsWith(".") ? step : `${step}.`))
    })),
    {
      rail: "Final checks",
      steps: [
        ...(amazon
          ? [
              "Match each carton to its label number in the packing list. Use each carton label once.",
              "Apply the buyer's shipping labels to the assigned cartons."
            ]
          : []),
        "Print labels at actual size (100%) and test-scan them before applying.",
        "Confirm pickup with the carrier."
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
