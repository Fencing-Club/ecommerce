import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { purchaseOrderPdf } from "../src/documents"
import { orderInputSchema } from "../src/index"

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

describe("purchase order PDF", () => {
  it("fits a short PO on one page", async () => {
    const pdf = await PDFDocument.load(await purchaseOrderPdf({ order: order(5), revision: 1, ...parties }))
    expect(pdf.getPageCount()).toBe(1)
  })

  it("continues a long PO onto more pages", async () => {
    const pdf = await PDFDocument.load(await purchaseOrderPdf({ order: order(60), revision: 2, ...parties }))
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })
})
