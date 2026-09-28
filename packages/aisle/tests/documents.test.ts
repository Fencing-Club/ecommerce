import { PDFDocument, StandardFonts } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { checklistPdf, drawableText, purchaseOrderPdf, type PoParty } from "../src/documents"
import { orderInputSchema, packingSchema, type OrderInput } from "../src/index"
import { readLabelPdfPages } from "../src/label-pdf-reader"

const item = (index: number) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  variantId: `gid://shopify/ProductVariant/${index}`,
  inventoryItemId: `gid://shopify/InventoryItem/${index}`,
  name: `Epee blade ${index}`,
  variant: index % 2 ? "Default Title" : "Medium",
  buyerSku: `blade-${index}`,
  supplierSku: index % 3 ? "" : `S-${index}`,
  asin: "",
  fnsku: "",
  pieces: 4,
  piecesPerSet: index % 4 ? 1 : 2,
  unitPrice: 7850
})
const order = (count: number) =>
  orderInputSchema.parse({
    supplierId: "00000000-0000-4000-8000-000000000001",
    reference: "PO-1",
    destination: "warehouse",
    deliveryId: "00000000-0000-4000-8000-000000000002",
    currency: "USD",
    dueDate: "2026-12-01",
    notes: "Please pack each blade separately.",
    adjustments: [{ description: "Freight", amount: 5000 }],
    items: Array.from({ length: count }, (_, index) => item(index + 1))
  })
const parties = {
  issued: "2026-09-27",
  buyer: { name: "Fencing Club", lines: ["10 Sample Road", "Sampletown, WA 98001"] },
  supplier: { name: "Unic", lines: [] },
  shipTo: { name: "Warehouse", lines: ["1 Test Street"] }
}

// The text a PDF shows, each run drawn on its own line.
const pdfText = async (bytes: Uint8Array) =>
  (await readLabelPdfPages(bytes)).pages.flatMap((page) => page.items).join("\n")

describe("purchase order PDF", () => {
  it("fits a short PO on one page", async () => {
    const pdf = await PDFDocument.load(await purchaseOrderPdf({ order: order(5), revision: 1, ...parties }))
    expect(pdf.getPageCount()).toBe(1)
  })

  it("continues a long PO onto more pages", async () => {
    const pdf = await PDFDocument.load(await purchaseOrderPdf({ order: order(60), revision: 2, ...parties }))
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })

  it("keeps Polish letters and curly punctuation, and leaves out Chinese", async () => {
    const base = order(1)
    const text = await pdfText(
      await purchaseOrderPdf({
        ...parties,
        order: {
          ...base,
          notes: "Pack each blade in the supplier’s “Kraków” box.",
          items: [{ ...base.items[0]!, name: "Epee blade 花剑" }]
        },
        revision: 1,
        supplier: { name: "Zakład Szermierczy", lines: ["ul. Przemysłowa 12", "30-701 Kraków"] }
      })
    )
    expect(text).toContain("Zaklad Szermierczy")
    expect(text).toContain("ul. Przemyslowa 12")
    expect(text).toContain("30-701 Kraków")
    expect(text).toContain("Pack each blade in the supplier’s “Kraków” box.")
    expect(text).toContain("Epee blade")
    expect(text).not.toMatch(/\p{Script=Han}/u)
  })
})

describe("document text", () => {
  it("keeps each character Helvetica has and replaces the rest", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica)
    expect(drawableText("ul. Przemysłowa 12, 30-701 Kraków", font)).toBe("ul. Przemyslowa 12, 30-701 Kraków")
    expect(drawableText("Fencing Club’s “blades” – 5 … — €9", font)).toBe("Fencing Club’s “blades” – 5 … — €9")
    // Letters lose the marks Helvetica can't draw.
    expect(drawableText("Győr, Łódź, İzmir, Đakovo", font)).toBe("Gyor, Lódz, Izmir, Dakovo")
    // A letter typed with a combining accent, full-width digits and a minus sign.
    expect(drawableText("Krako\u{301}w \u{ff11}\u{ff12} \u{2212}20 °C", font)).toBe("Kraków 12 -20 °C")
    // Chinese has no nearer letter, so each character becomes a space.
    expect(drawableText("花剑 blade", font)).toBe("   blade")
  })
})

describe("packing checklist PDF", () => {
  const packing = (shipment: OrderInput) =>
    packingSchema.parse({
      invoiceDocumentId: "00000000-0000-4000-8000-000000000003",
      readyDate: "2026-11-20",
      origin: {
        name: "Zakład Szermierczy",
        addressLine1: "ul. Przemysłowa 12",
        city: "Kraków",
        stateOrRegion: "Lesser Poland",
        postalCode: "30-701",
        countryCode: "PL",
        phoneNumber: "+48 12 555 0100"
      },
      cartons: [
        {
          cartonId: "A1",
          length: 50,
          width: 40,
          height: 30,
          weight: 12,
          items: shipment.items.map((row) => ({ itemId: row.id, pieces: row.pieces }))
        }
      ]
    })
  // The checklist's text with whitespace as single spaces, since a value that wraps is drawn as separate runs.
  const checklistText = async (shipment: OrderInput, shipTo?: PoParty) => {
    const bytes = await checklistPdf({ order: shipment, packing: packing(shipment), buyer: parties.buyer, shipTo })
    return (await pdfText(bytes)).replace(/\s+/g, " ")
  }

  it("names the destination after the ship-to, in full", async () => {
    const text = await checklistText(order(1), { name: "Fencing Club, Seattle fulfillment warehouse", lines: [] })
    expect(text).toContain("Fencing Club, Seattle fulfillment warehouse")
    expect(text).not.toContain("Buyer's location")
  })

  it("names the kind of destination without a ship-to", async () => {
    expect(await checklistText(order(1))).toContain("Buyer's location")
  })

  it("keeps the Amazon network as an Amazon shipment's destination", async () => {
    const text = await checklistText(
      { ...order(1), destination: "amazon" },
      { name: "Ningbo Consolidation, Dock 4", lines: [] }
    )
    expect(text).toContain("Amazon FBA")
    expect(text).not.toContain("Ningbo Consolidation")
  })
})
