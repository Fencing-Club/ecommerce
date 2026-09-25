import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { money, orderTotal, type OrderInput, type Packing } from "./index"
import type { CartonLabel } from "./labels"

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
export async function purchaseOrderPdf(order: OrderInput, buyer: string, supplier: string, revision: number) {
  const w = await writer("Purchase order", `${order.reference} / Revision ${revision}`)
  w.section(`${buyer} to ${supplier}`)
  w.line(
    `Destination: ${order.destination.replaceAll("_", " ").toUpperCase()} | Required: ${order.dueDate} | Currency: ${order.currency}`
  )
  for (const item of order.items) {
    w.section(`${item.name} / ${item.variant}`)
    w.line(`Buyer SKU: ${item.buyerSku} | Supplier SKU: ${item.supplierSku || "Not provided"}`)
    w.line(
      `${item.pieces} pieces at ${money(item.unitPrice, order.currency)} per piece = ${money(item.pieces * item.unitPrice, order.currency)}`
    )
    w.line(`Pack ${item.piecesPerSet} piece(s) per sellable unit`)
    if (item.instructions) {
      w.line(item.instructions)
    }
  }
  w.section(`Total: ${money(orderTotal(order), order.currency)}`)
  if (order.notes) {
    w.line(order.notes)
  }
  return w.save()
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
      w.line(`Supplier SKU: ${item.supplierSku || "Not provided"}`)
      w.line(
        `${contents.pieces} pieces / ${contents.pieces / item.piecesPerSet} sellable units / ${item.piecesPerSet} piece(s) per unit`
      )
    }
  }
  return w.save()
}
export async function checklistPdf(order: OrderInput, packing: Packing) {
  const w = await writer("Packing Checklist", `${order.reference} / AWD USA`)
  w.section("Cartons")
  for (const text of [
    "Maximum carton dimensions: 63.5 cm on each side.",
    "Maximum gross weight: 50 lb (22.68 kg).",
    "Pack one SKU and no more than 150 sellable units per carton.",
    "Use the same carton configuration for each SKU.",
    "Match carton contents and quantities to the packing list."
  ]) {
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
    w.check(`Apply FNSKU ${item.fnsku} to the outside of each sellable unit. Cover conflicting product barcodes.`)
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
