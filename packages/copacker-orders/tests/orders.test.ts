import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { approveChanges, commercialChanges, orderInputSchema } from "../src/index"

const itemId = randomUUID()
const order = orderInputSchema.parse({
  supplierId: randomUUID(),
  reference: "PO-37",
  currency: "USD",
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
      unitPrice: 210,
      receiver: "awd_us"
    }
  ]
})
// The same PO to one of the buyer's own locations.
const warehouseOrder = (deliveryId?: string) => ({
  ...order,
  ...(deliveryId && { deliveryId }),
  items: order.items.map((item) => ({ ...item, receiver: "warehouse" as const }))
})

describe("Purchase orders", () => {
  it("requires a delivery address for the buyer's own location", () => {
    expect(orderInputSchema.safeParse(warehouseOrder()).success).toBe(false)
    expect(orderInputSchema.safeParse(warehouseOrder(randomUUID())).success).toBe(true)
  })
  it("sends every line of a PO to one group of receivers", () => {
    const mixed = {
      ...warehouseOrder(randomUUID()),
      items: [...order.items, { ...order.items[0]!, id: randomUUID(), buyerSku: "x", receiver: "warehouse" }]
    }
    expect(orderInputSchema.safeParse(mixed).success).toBe(false)
  })
  it("stops at a forwarder on the way to Amazon or the buyer's own location, never ends there", () => {
    const via = { forwarderId: randomUUID(), addressId: randomUUID() }
    expect(orderInputSchema.safeParse({ ...order, via }).success).toBe(true)
    expect(orderInputSchema.safeParse({ ...warehouseOrder(randomUUID()), via }).success).toBe(true)
    const toForwarder = { ...order, items: order.items.map((item) => ({ ...item, receiver: "forwarder" })) }
    expect(orderInputSchema.safeParse(toForwarder).success).toBe(false)
  })
  it("lists each product once", () => {
    const twice = { ...order, items: [...order.items, { ...order.items[0]!, id: randomUUID() }] }
    expect(orderInputSchema.safeParse(twice).success).toBe(false)
  })
})

describe("Supplier changes", () => {
  it("applies only allowed commercial changes without mutating historical PO", () => {
    const changes = [
      { itemId, supplierSku: "B02-new", unitPrice: 230 },
      { itemId: randomUUID(), supplierSku: "B03", unitPrice: 100 }
    ]
    expect(commercialChanges(order, { changes: [{ itemId, supplierSku: "B02", unitPrice: 210 }] })).toEqual([])
    expect(commercialChanges(order, { changes })).toEqual(changes)
    const approved = approveChanges(order, { changes })
    expect(approved.items).toHaveLength(1)
    expect(approved.items[0]?.supplierSku).toBe("B02-new")
    expect(approved.items[0]?.unitPrice).toBe(230)
    expect(approved.items[0]?.buyerSku).toBe("foil-2")
    expect(order.items[0]?.unitPrice).toBe(210)
  })
  it("clears a catalog quote when the supplier changes its SKU", () => {
    const quoted = orderInputSchema.parse({
      ...order,
      items: [
        {
          ...order.items[0],
          supplierCatalogStatus: "matched",
          supplierCatalog: {
            productId: randomUUID(),
            revision: 3,
            supplierSku: "B02",
            title: "Body cord",
            currency: "USD",
            priceMinor: 210,
            priceBasis: "piece",
            piecesPerSellablePack: 1,
            sellablePacksPerCase: null
          }
        }
      ]
    })
    const changed = approveChanges(quoted, { changes: [{ itemId, supplierSku: "B02-new", unitPrice: 230 }] })
    expect(changed.items[0]?.supplierCatalog).toBeUndefined()
    expect(changed.items[0]?.supplierCatalogStatus).toBeUndefined()
    expect(quoted.items[0]?.supplierCatalog?.supplierSku).toBe("B02")
    const repriced = approveChanges(quoted, { changes: [{ itemId, supplierSku: "B02", unitPrice: 230 }] })
    expect(repriced.items[0]?.supplierCatalog?.supplierSku).toBe("B02")
  })
})
