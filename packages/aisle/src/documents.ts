import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { amazonDestinations, money, orderTotal, type OrderInput, type Packing } from "./index"
import type { CartonLabel } from "./labels"
import { destinationRequirements, itemRequirements, prepInstructions, sharedPrep } from "./requirements"

async function writer(title: string, reference: string) {
  const pdf = await PDFDocument.create(),
    regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([595.28, 841.89]),
    y = 788
  const safe = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, " ")
  function line(text: string, size = 10, strong = false, gap = 6) {
    const font = strong ? bold : regular,
      words = safe(text).split(/\s+/),
      rows: string[] = []
    let row = ""
    for (const word of words) {
      const next = row ? `${row} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > 491 && row) {
        rows.push(row)
        row = word
      } else {
        row = next
      }
    }
    rows.push(row)
    for (const value of rows) {
      if (y < 65) {
        page = pdf.addPage([595.28, 841.89])
        y = 788
      }
      page.drawText(value, { x: 52, y, size, font, color: rgb(0.13, 0.16, 0.2) })
      y -= size + gap
    }
  }
  function section(text: string) {
    y -= 18
    line(text, 12, true, 10)
  }
  function check(text: string) {
    if (y < 80) {
      page = pdf.addPage([595.28, 841.89])
      y = 788
    }
    page.drawRectangle({ x: 38, y: y - 1, width: 7, height: 7, borderWidth: 0.8, borderColor: rgb(0.3, 0.3, 0.3) })
    line(text)
  }
  line("COPACKER", 10, true, 18)
  line(title, 26, true, 14)
  line(reference, 11)
  return { line, section, check, save: () => pdf.save() }
}
// "2026-12-01" as "December 1, 2026".
function longDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })
}

// Who a PO is from or to, as printed on it: a name, then address and contact lines.
export type PoParty = { name: string; lines: string[] }

const poDestinations: Record<string, string> = {
  amazon: "Amazon AWD, USA",
  awd_us: "Amazon AWD, USA",
  awd_china: "Amazon AWD, China",
  fba: "Amazon FBA",
  forwarder: "Freight forwarder",
  warehouse: "Buyer's location"
}

// A purchase order laid out like Fencing Club's printed invoice: a masthead with the buyer and the document type over
// a heavy rule, a band with the PO's number, dates and total, then labelled sections for the parties, the items, the
// summary, the instructions and notes. Every page ends with the buyer's name, contact details and page count.
export async function purchaseOrderPdf(input: {
  order: OrderInput
  revision: number
  issued: string
  buyer: PoParty & { email?: string | null; website?: string | null }
  supplier: PoParty
  shipTo?: PoParty
}) {
  const { order, revision, buyer, supplier } = input
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Purchase order ${order.reference}`)
  pdf.setAuthor(buyer.name)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0, 0, 0)
  const muted = rgb(0.29, 0.29, 0.33)
  const rule = rgb(0.55, 0.55, 0.58)
  const [width, height] = [612, 792]
  const left = 43
  const right = width - 43
  const top = height - 40
  const bottom = 64
  const rail = 96
  const content = left + rail
  const safe = (value: string) => value.replace(/[^\x20-\x7e\xa0-\xff]/g, " ")
  const price = (minor: number) => money(minor, order.currency)
  type Font = typeof regular

  // Text drawn one character at a time with extra space between, like the invoice's tracked capitals.
  const trackedWidth = (value: string, size: number, font: Font, tracking: number) =>
    font.widthOfTextAtSize(safe(value), size) + tracking * Math.max(0, safe(value).length - 1)
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
  let y = top
  type Style = { size?: number; font?: Font; color?: typeof ink; tracking?: number; align?: "left" | "right" }
  const draw = (
    value: string,
    x: number,
    { size = 10, font = regular, color = ink, tracking = 0, align = "left" }: Style = {}
  ) => {
    const text = safe(value)
    let at = align === "right" ? x - trackedWidth(text, size, font, tracking) : x
    if (!tracking) {
      page.drawText(text, { x: at, y, size, font, color })
      return
    }
    for (const char of text) {
      page.drawText(char, { x: at, y, size, font, color })
      at += font.widthOfTextAtSize(char, size) + tracking
    }
  }
  const label = (value: string, x: number, align: "left" | "right" = "left") =>
    draw(value.toUpperCase(), x, { size: 8, font: bold, tracking: 1.3, align })
  const line = (from: number, to: number, at: number, thickness = 0.75, color = rule) =>
    page.drawLine({ start: { x: from, y: at }, end: { x: to, y: at }, thickness, color })
  const newPage = () => {
    page = pdf.addPage([width, height])
    y = top
  }
  const ensure = (space: number) => {
    if (y - space < bottom) {
      newPage()
      return true
    }
    return false
  }

  // Masthead: the buyer's name and contact lines, and the document type.
  const mastTop = y
  draw(buyer.name.toUpperCase(), left, { size: 13, font: bold, tracking: 1.9 })
  y -= 15
  for (const row of buyer.lines) {
    draw(row, left, { size: 9.5, color: muted })
    y -= 12
  }
  const mastBottom = y
  y = mastTop - Math.max(0, (mastTop - mastBottom - 24) / 2)
  draw("PURCHASE ORDER", right, { size: 22, font: bold, tracking: 2.6, align: "right" })
  y = Math.min(mastBottom, y - 12) - 4
  line(left, right, y, 1.5, ink)

  // The meta band: four facts, divided by hairlines.
  const facts: Array<[string, string, boolean]> = [
    ["PO number", revision > 1 ? `${order.reference} (rev. ${revision})` : order.reference, false],
    ["Date", longDate(input.issued), false],
    ["Required by", longDate(order.dueDate), false],
    ["Total", price(orderTotal(order)), true]
  ]
  const band = (right - left) / facts.length
  const bandTop = y
  facts.forEach(([name, value, big], index) => {
    const x = left + index * band + (index ? 16 : 0)
    y = bandTop - 20
    label(name, x)
    y -= big ? 19 : 16
    draw(value, x, { size: big ? 16 : 11.5, font: bold })
    if (index) {
      page.drawLine({
        start: { x: left + index * band, y: bandTop },
        end: { x: left + index * band, y: bandTop - 50 },
        thickness: 0.75,
        color: rule
      })
    }
  })
  y = bandTop - 50
  line(left, right, y)

  // A section: its label in the left rail, beside the first line of its content.
  const section = (name: string, gap = 20) => {
    y -= gap
    label(name, left)
  }

  // Parties: the supplier and where to ship.
  const shipTo: PoParty = input.shipTo ?? { name: poDestinations[order.destination] ?? order.destination, lines: [] }
  const partyWidth = (right - content) / 2
  section("Parties")
  const partiesTop = y
  let lowest = y
  ;(
    [
      ["Supplier", supplier],
      ["Ship to", shipTo]
    ] as const
  ).forEach(([name, party], index) => {
    const x = content + index * partyWidth
    y = partiesTop
    label(name, x)
    y -= 15
    for (const row of wrap(party.name, bold, 11, partyWidth - 20)) {
      draw(row, x, { size: 11, font: bold })
      y -= 13
    }
    for (const row of party.lines.flatMap((value) => wrap(value, regular, 10, partyWidth - 20))) {
      draw(row, x, { size: 10, color: muted })
      y -= 12.5
    }
    lowest = Math.min(lowest, y)
  })
  y = lowest - 6
  line(left, right, y)

  // Items: quantity, what it is and how to prepare it, the supplier's SKU, and prices.
  const columns = {
    qty: content,
    description: content + 34,
    sku: right - 262,
    unit: right - 96,
    amount: right
  }
  const descriptionWidth = columns.sku - 12 - columns.description
  const itemsHeader = (first: boolean) => {
    if (first) {
      section("Items", 22)
    } else {
      y -= 4
      label("Items", left)
    }
    label("Qty", columns.qty)
    label("Description", columns.description)
    label("Supplier SKU", columns.sku)
    label("Unit price", columns.unit, "right")
    label("Amount", columns.amount, "right")
    y -= 7
    line(content, right, y, 0.75, ink)
  }
  const prep = sharedPrep(order)
  itemsHeader(true)
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
      itemsHeader(false)
    }
    y -= 15
    const rowTop = y
    draw(item.pieces.toLocaleString("en-US"), columns.qty, { size: 10.5 })
    draw(price(item.unitPrice), columns.unit, { size: 10.5, align: "right" })
    draw(price(item.pieces * item.unitPrice), columns.amount, { size: 10.5, font: bold, align: "right" })
    skus.forEach((sku, index) => {
      y = rowTop - index * 11.5
      draw(sku, columns.sku, { size: 9.5, color: item.supplierSku || item.components?.length ? ink : muted })
    })
    y = rowTop
    for (const row of title) {
      draw(row, columns.description, { size: 10.5, font: bold })
      y -= 12.5
    }
    for (const row of variant) {
      draw(row, columns.description, { size: 9.5 })
      y -= 11.5
    }
    for (const row of details) {
      draw(row, columns.description, { size: 8.5, color: muted })
      y -= 10.5
    }
    y = Math.min(y, rowTop - skus.length * 11.5)
    line(content, right, y + 2)
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
  section("Summary", 22)
  for (const [name, amount] of summary) {
    draw(name, columns.unit, { size: 10.5, color: muted, align: "right" })
    draw(price(amount), columns.amount, { size: 10.5, align: "right" })
    y -= 15
  }
  if (summary.length) {
    line(columns.unit - 110, right, y + 9, 0.75, ink)
    y -= 6
  }
  draw("Total", columns.unit, { size: 12, font: bold, align: "right" })
  draw(price(orderTotal(order)), columns.amount, { size: 12, font: bold, align: "right" })

  // Instructions for the whole shipment, and the buyer's notes.
  const blocks: Array<[string, string[]]> = [
    ["Payment terms", order.paymentTerms ? [order.paymentTerms] : []],
    ["Instructions", [...(prep ? [`${prepInstructions[prep]}.`] : []), ...destinationRequirements(order.destination)]],
    ["Notes", order.notes ? [order.notes] : []]
  ]
  for (const [name, entries] of blocks) {
    const rows = entries.flatMap((value) => wrap(value, regular, 10, right - content))
    if (!rows.length) {
      continue
    }
    ensure(rows.length * 13 + 40)
    y -= 12
    line(left, right, y)
    section(name, 20)
    for (const row of rows) {
      draw(row, content, { size: 10 })
      y -= 13
    }
  }

  // Every page's footer: the buyer, how to reach them, and the PO and page.
  const pages = pdf.getPages()
  const contact = [buyer.email, buyer.website?.replace(/^https?:\/\//, "").replace(/\/$/, "")].filter(
    (value): value is string => Boolean(value)
  )
  pages.forEach((each, index) => {
    page = each
    y = 40
    line(left, right, y + 12, 0.75, ink)
    draw(buyer.name.toUpperCase(), left, { size: 8, font: bold, tracking: 1.5 })
    let x = left + trackedWidth(buyer.name.toUpperCase(), 8, bold, 1.5) + 18
    for (const value of contact) {
      draw(value, x, { size: 8, color: muted })
      x += regular.widthOfTextAtSize(safe(value), 8) + 18
    }
    draw(`${order.reference}   PAGE ${index + 1} OF ${pages.length}`, right, {
      size: 8,
      font: bold,
      tracking: 1.2,
      color: muted,
      align: "right"
    })
  })
  return pdf.save()
}
export async function packingListPdf(order: OrderInput, packing: Packing, labels: CartonLabel[], shipmentId: string) {
  const w = await writer("Packing list", `${order.reference} / ${shipmentId}`)
  w.line(`${packing.cartons.length} cartons | Ready for pickup: ${packing.readyDate}`)
  for (const carton of packing.cartons) {
    w.section(`Carton ${carton.cartonId}`)
    w.line(`Dimensions: ${carton.length} x ${carton.width} x ${carton.height} cm`)
    w.line(`Gross weight: ${carton.weight} kg`)
    w.line(`Amazon label number: ${labels.find((l) => l.cartonId === carton.cartonId)?.sscc ?? "Pending"}`)
    for (const contents of carton.items) {
      const item = order.items.find((i) => i.id === contents.itemId)!
      w.line(`${item.name} / ${item.variant}`, 11, true)
      w.line(`Buyer SKU: ${item.buyerSku}`)
      w.line(`Supplier SKU: ${item.components?.length ? "See components" : item.supplierSku || "Not provided"}`)
      for (const component of item.components ?? []) {
        w.line(
          `  Per sellable unit: ${component.buyerSku || component.variantId} x${component.quantity} | Supplier SKU: ${component.supplierSku || "Not provided"}`
        )
      }
      w.line(
        `${contents.pieces} pieces / ${contents.pieces / item.piecesPerSet} sellable units / ${item.piecesPerSet} piece(s) per unit`
      )
    }
  }
  return w.save()
}
export async function checklistPdf(order: OrderInput, packing: Packing) {
  const amazon = amazonDestinations.includes(order.destination)
  const w = await writer("Packing Checklist", `${order.reference} / ${amazon ? "AWD USA" : "Your buyer's location"}`)
  w.section("Cartons")
  const amazonRules = [
    "Maximum carton dimensions: 63.5 cm on each side.",
    "Maximum gross weight: 50 lb (22.68 kg).",
    "Pack one SKU and no more than 150 sellable units per carton.",
    "Use the same carton configuration for each SKU."
  ]
  for (const text of [...(amazon ? amazonRules : []), "Match carton contents and quantities to the packing list."]) {
    w.check(text)
  }
  w.section("Unit preparation")
  w.check(
    "Seal each sellable unit in a transparent polybag with an accessible barcode, unless the item instructions specify an exception."
  )
  w.check("Add a suffocation warning for bag openings 5 inches or larger.")
  w.check("For multi-packs, keep the complete set together and apply one unit label.")
  const included = new Set(packing.cartons.flatMap((c) => c.items.map((i) => i.itemId)))
  for (const item of order.items.filter((i) => included.has(i.id))) {
    w.section(`${item.name} / ${item.variant}`)
    if (amazon) {
      w.check(`Apply FNSKU ${item.fnsku} to the outside of each sellable unit. Cover conflicting product barcodes.`)
    }
    if (item.instructions) {
      for (const instruction of item.instructions.split("\n").filter(Boolean)) {
        w.check(instruction)
      }
    }
  }
  w.section("Final checks")
  w.check("Match each carton to its label number in the packing list. Use each carton label once.")
  w.check("Apply the buyer-provided shipping labels to the assigned cartons.")
  w.check("Print labels at actual size (100%) and test-scan before applying.")
  w.check("Confirm pickup arrangements with the carrier.")
  return w.save()
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
