import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  itemTotal,
  orderCharges,
  orderInputSchema,
  orderSubtotal,
  orderTotal,
  orderUnits,
  productLabel,
  shipmentGroups,
  supplierChargeTotal,
  variantTitle
} from "../src/index"

const order = () =>
  orderInputSchema.parse({
    supplierId: randomUUID(),
    reference: "PO-PACKING",
    currency: "USD",
    items: [
      { pieces: 800, unitPrice: 408, receiver: "awd_us" },
      { pieces: 1120, unitPrice: 423, receiver: "awd_us" },
      { pieces: 1200, unitPrice: 113, receiver: "fba" }
    ].map((item, index) => ({
      ...item,
      id: randomUUID(),
      variantId: `gid://shopify/ProductVariant/${index + 1}`,
      inventoryItemId: `gid://shopify/InventoryItem/${index + 1}`,
      name: `Cord ${index + 1}`,
      variant: "Two pack",
      buyerSku: `CORD-${index + 1}`,
      supplierSku: "SUPPLIER-CORD",
      asin: "",
      fnsku: "",
      piecesPerSet: 2,
      supplierCharges: index < 2 ? [{ description: "Packing", amount: 26, basis: "pack" }] : []
    }))
  })

describe("product supplier costs", () => {
  it("charges once per assembled pack and keeps PO charges separate", () => {
    const data = order()
    expect(itemTotal(data.items[0]!)).toBe(336800)
    expect(itemTotal(data.items[1]!)).toBe(488320)
    expect(orderCharges(data)).toEqual([{ description: "Packing", amount: 24960 }])
    expect(orderTotal(data)).toBe(960720)
    expect(orderTotal({ ...data, adjustments: [{ description: "Freight", amount: 5000 }] })).toBe(965720)
    expect(orderCharges({ ...data, adjustments: [{ description: "Packing", amount: 1000 }] })).toEqual([
      { description: "Packing", amount: 25960 }
    ])
  })

  it("recalculates on quantity changes and follows the product between networks", () => {
    const data = order()
    const first = data.items[0]!
    expect(itemTotal({ ...first, pieces: 802 }) - itemTotal(first)).toBe(842)
    const moved = { ...first }
    moved.receiver = "fba"
    expect(itemTotal(moved)).toBe(itemTotal(first))
    expect(orderTotal({ ...data, items: data.items.slice(1) })).toBe(623920)
  })

  it("supports per-piece and flat service amounts without multiplying flat charges", () => {
    const item = order().items[0]!
    expect(supplierChargeTotal(item, { description: "Labeling", amount: 10, basis: "piece" })).toBe(8000)
    expect(supplierChargeTotal(item, { description: "Setup", amount: 5000, basis: "flat" })).toBe(5000)
  })

  it("adds up the products before services and charges", () => {
    const data = order()
    expect(orderUnits(data)).toBe(3120)
    expect(orderSubtotal(data)).toBe(800 * 408 + 1120 * 423 + 1200 * 113)
    const withFreight = { ...data, adjustments: [{ description: "Freight", amount: 5000 }] }
    expect(orderSubtotal(withFreight)).toBe(orderSubtotal(data))
    expect(orderUnits({ items: [] })).toBe(0)
  })

  it("rejects negative service rates and unsafe totals", () => {
    const data = order()
    expect(
      orderInputSchema.safeParse({
        ...data,
        items: data.items.map((item) => ({
          ...item,
          supplierCharges: [{ description: "Packing", amount: -1, basis: "pack" }]
        }))
      }).success
    ).toBe(false)
    const items = Array.from({ length: 150 }, (_, index) => ({
      ...data.items[0]!,
      id: randomUUID(),
      buyerSku: `SKU-${index}`,
      pieces: 1000000,
      supplierCharges: [{ description: "Packing", amount: 100000000, basis: "piece" }]
    }))
    expect(orderInputSchema.safeParse({ ...data, items }).success).toBe(false)
  })
})

describe("shipment groups", () => {
  it("lists Amazon's networks in their own order, then the buyer's location, keeping each line's place", () => {
    const lines = [
      { id: "tote", receiver: "awd_us" },
      { id: "apron", receiver: "fba" },
      { id: "basket", receiver: "awd_us" }
    ] as const
    expect(shipmentGroups(lines)).toEqual([
      { receiver: "fba", lines: [lines[1]] },
      { receiver: "awd_us", lines: [lines[0], lines[2]] }
    ])
    expect(shipmentGroups([{ receiver: "warehouse" }])).toEqual([
      { receiver: "warehouse", lines: [{ receiver: "warehouse" }] }
    ])
    expect(shipmentGroups([])).toEqual([])
  })
})

describe("product names", () => {
  it("leaves out Shopify's Default Title", () => {
    expect(variantTitle("Natural")).toBe("Natural")
    expect(variantTitle("Default Title")).toBeNull()
    expect(variantTitle("")).toBeNull()
    expect(variantTitle(null)).toBeNull()
    expect(productLabel("Canvas tote bag", "Natural")).toBe("Canvas tote bag / Natural")
    expect(productLabel("Linen apron", "Default Title")).toBe("Linen apron")
  })
})
