import { PDFDocument, StandardFonts } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { commercialInvoicePdf, drawableText, purchaseOrderPdf } from "../src/documents"
import { orderInputSchema, type OrderInput } from "../src/index"
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
  unitPrice: 7850,
  receiver: "warehouse" as const
})
const order = (count: number) =>
  orderInputSchema.parse({
    supplierId: "00000000-0000-4000-8000-000000000001",
    reference: "PO-1",
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
  it("prints supplier service rates and includes them once in the total", async () => {
    const base = order(1)
    const data: OrderInput = {
      ...base,
      items: [
        { ...base.items[0]!, piecesPerSet: 2, supplierCharges: [{ description: "Packing", amount: 26, basis: "pack" }] }
      ]
    }
    const text = (await pdfText(await purchaseOrderPdf({ order: data, revision: 1, ...parties }))).replace(/\s+/g, " ")
    expect(text).toContain("Packing: $0.26 per pack ($0.52)")
    expect(text).toContain("$364.52")
  })

  it("uses edited packing instructions in the PO and invoice", async () => {
    const data = order(1)
    data.items[0]!.instructions = "Obsolete instructions"
    data.items[0]!.packingRequirements = {
      preparation: "none",
      labels: [],
      countryCode: "",
      instructions: "- Use the updated grip material."
    }
    for (const bytes of [
      await purchaseOrderPdf({ order: data, revision: 1, ...parties }),
      await commercialInvoicePdf({ order: data, revision: 1, ...parties })
    ]) {
      const text = (await pdfText(bytes)).replace(/\s+/g, " ")
      expect(text).toContain("Use the updated grip material.")
      expect(text).not.toContain("Obsolete instructions")
    }
  })

  it("fits a short PO on one page", async () => {
    const pdf = await PDFDocument.load(await purchaseOrderPdf({ order: order(5), revision: 1, ...parties }))
    expect(pdf.getPageCount()).toBe(1)
  })

  it("continues a long PO onto more pages", async () => {
    const pdf = await PDFDocument.load(await purchaseOrderPdf({ order: order(60), revision: 2, ...parties }))
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })

  it("renders Markdown instructions and notes without exposing their markup", async () => {
    const data = order(1)
    data.items[0]!.instructions = "- **Seal** each bag.\n- Keep both units together."
    data.notes = "### Handoff\n\n3. Keep cartons at the pickup address.\n4. Contact the buyer if quantities differ."
    const text = (await pdfText(await purchaseOrderPdf({ order: data, revision: 1, ...parties }))).replace(/\s+/g, " ")
    expect(text).toContain("Seal each bag.")
    expect(text).toContain("Keep both units together.")
    expect(text).toContain("3. Keep cartons at the pickup address.")
    expect(text).toContain("4. Contact the buyer if quantities differ.")
    expect(text).not.toContain("**")
    expect(text).not.toContain("###")
  })

  it("keeps all Markdown instructions when a list continues onto another page", async () => {
    const data = order(1)
    data.notes = Array.from(
      { length: 70 },
      (_, index) => `${index + 1}. Check carton ${index + 1} before handoff.`
    ).join("\n")
    const bytes = await purchaseOrderPdf({ order: data, revision: 1, ...parties })
    const pages = (await readLabelPdfPages(bytes)).pages
    expect(pages.length).toBeGreaterThan(1)
    const text = pages.flatMap((page) => page.items).join(" ")
    for (let i = 1; i <= 70; i++) {
      expect(text).toContain(`Check carton ${i} before handoff.`)
    }
    for (const page of pages) {
      expect(page.items.join(" ")).toContain("Order revision 1 / Issued 2026-09-27")
    }
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
