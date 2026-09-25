import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  orderInputSchema,
  packingSchema,
  validatePacking,
  buildAwdRequest,
  commercialChanges,
  approveChanges
} from "../src/index"
const itemId = randomUUID()
const order = orderInputSchema.parse({
  supplierId: randomUUID(),
  reference: "PO-37",
  destination: "awd_us",
  currency: "USD",
  dueDate: "2026-10-10",
  items: [
    {
      id: itemId,
      variantId: "gid://shopify/ProductVariant/1",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      name: "Foil body cord",
      variant: "Two pack",
      buyerSku: "foil-2",
      supplierSku: "B02",
      asin: "B000000001",
      fnsku: "X000000001",
      pieces: 320,
      piecesPerSet: 2,
      unitPrice: 210
    }
  ]
})
const packing = packingSchema.parse({
  invoiceDocumentId: randomUUID(),
  readyDate: "2026-10-05",
  origin: {
    name: "Supplier",
    addressLine1: "13 Changxing Road",
    city: "Zhangjiagang",
    stateOrRegion: "Jiangsu",
    postalCode: "215600",
    countryCode: "CN",
    phoneNumber: "+8618861613263",
    email: "supplier@example.com"
  },
  cartons: ["A6", "A7"].map((cartonId) => ({
    cartonId,
    length: 50,
    width: 40,
    height: 30,
    weight: 15,
    items: [{ itemId, pieces: 160 }]
  }))
})
describe("Supplier piece and carton contract", () => {
  it("groups identical physical cartons and converts pieces to sellable packs", () => {
    expect(validatePacking(order, packing).valid).toBe(true)
    const request = buildAwdRequest(order, packing, "copacker-test")
    expect(request.packagesToInbound).toHaveLength(1)
    expect(request.packagesToInbound[0]?.count).toBe(2)
    expect(request.packagesToInbound[0]?.distributionPackage.contents.products[0]?.quantity).toBe(80)
    expect(request.originAddress).not.toHaveProperty("email")
    expect(packing.cartons.map((c) => c.cartonId)).toEqual(["A6", "A7"])
  })
  it.each([63.5001, 70])("rejects oversized cartons (%s cm)", (length) => {
    const p = structuredClone(packing)
    p.cartons[0]!.length = length
    expect(validatePacking(order, p).valid).toBe(false)
  })
  it("uses the exact 50-pound boundary", () => {
    const p = structuredClone(packing)
    p.cartons.forEach((c) => {
      c.weight = 22.68
    })
    expect(validatePacking(order, p).issues.some((i) => i.message.includes("weight"))).toBe(true)
  })
  it("rejects broken multipacks, duplicate carton IDs, and inconsistent configurations", () => {
    const p = structuredClone(packing)
    p.cartons[1]!.cartonId = "a6"
    p.cartons[1]!.items[0]!.pieces = 159
    const result = validatePacking(order, p)
    expect(result.issues).toHaveLength(3)
  })
  it("honors quantities reserved by another partial shipment", () => {
    expect(validatePacking(order, packing, { [itemId]: 2 }).issues.some((i) => i.message.includes("remaining"))).toBe(
      true
    )
  })
  it("does not substitute US AWD rules for a China destination", () => {
    expect(validatePacking({ ...order, destination: "awd_china" }, packing).valid).toBe(false)
  })
  it("rejects products outside the PO and missing FNSKUs", () => {
    const p = structuredClone(packing)
    p.cartons[0]!.items[0]!.itemId = randomUUID()
    expect(validatePacking(order, p).valid).toBe(false)
    expect(validatePacking({ ...order, items: [{ ...order.items[0]!, fnsku: "" }] }, packing).valid).toBe(false)
  })
  it("applies only allowed commercial changes without mutating historical PO", () => {
    const p = { ...packing, changes: [{ itemId, supplierSku: "B02-new", unitPrice: 230 }] }
    expect(commercialChanges(order, p)).toHaveLength(1)
    const approved = approveChanges(order, p)
    expect(approved.items[0]?.supplierSku).toBe("B02-new")
    expect(approved.items[0]?.buyerSku).toBe("foil-2")
    expect(order.items[0]?.unitPrice).toBe(210)
  })
})
