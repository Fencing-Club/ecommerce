import { PDFDocument, StandardFonts } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { drawableText, orderLineText } from "../src/documents"
import { orderInputSchema } from "../src/index"
import { sharedPrep } from "../src/requirements"

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
// Documents are never drawn in tests; these check the text a PO or invoice line prints.
describe("order line text", () => {
  it("prints supplier service rates with their cost", () => {
    const line = { ...order(1).items[0]!, piecesPerSet: 2 }
    line.supplierCharges = [{ description: "Packing", amount: 26, basis: "pack" }]
    expect(orderLineText(line, "USD", null).details).toContain("Packing: $0.26 per pack ($0.52)")
  })

  it("uses edited packing instructions, not the old ones", () => {
    const data = order(1)
    data.items[0]!.instructions = "Obsolete instructions"
    data.items[0]!.packingRequirements = {
      preparation: "none",
      labels: [],
      countryCode: "",
      instructions: "- Use the updated grip material."
    }
    const text = orderLineText(data.items[0]!, data.currency, sharedPrep(data))
    expect(text.instructions).toBe("- Use the updated grip material.")
    expect(text.details.join(" ")).not.toContain("Obsolete instructions")
  })

  it("lists a bundle's component SKUs, or the line's own", () => {
    const line = order(3).items[2]!
    expect(orderLineText(line, "USD", null).skus).toEqual(["S-3"])
    expect(orderLineText({ ...line, supplierSku: "" }, "USD", null).skus).toEqual(["Not set"])
    const bundle = {
      ...line,
      components: [
        { buyerSku: "single", variantId: "gid://shopify/ProductVariant/99", supplierSku: "OKFO26.2", quantity: 2 }
      ]
    }
    expect(orderLineText(bundle, "USD", null).skus).toEqual(["2 x OKFO26.2"])
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
