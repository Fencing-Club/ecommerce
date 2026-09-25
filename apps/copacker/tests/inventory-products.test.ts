import { describe, expect, it } from "vitest"
import { groupInventory, inventoryLocations, onOrderByVariant } from "../src/server/inventory-products"

const level = (locationId: string, locationName: string, available: number | null, onHand = available) => ({
  locationId: `gid://shopify/Location/${locationId}`,
  locationName,
  available,
  onHand,
  incoming: 0,
  committed: 0
})

const row = (variant: number, product: number, fields: Record<string, unknown>) => ({
  variantId: `gid://shopify/ProductVariant/${variant}`,
  inventoryItemId: `gid://shopify/InventoryItem/${variant}`,
  buyerSku: `sku-${variant}`,
  productId: `gid://shopify/Product/${product}`,
  tracked: true,
  unit: "shopify_inventory_unit" as const,
  levels: [],
  ...fields
})

const rows = [
  row(1, 10, {
    productTitle: "Pro-grip glove",
    variantTitle: "Right / 10",
    imageUrl: "https://cdn.shopify.com/right.jpg",
    levels: [level("1", "Fencing Club", 3), level("2", "Amazon Fulfillment", null)]
  }),
  row(2, 10, {
    productTitle: "Pro-grip glove",
    variantTitle: "Right / 6",
    imageUrl: null,
    levels: [level("1", "Fencing Club", -1), level("2", "Amazon Fulfillment", 4)]
  }),
  row(3, 20, {
    productTitle: "Body cord",
    variantTitle: "Default Title",
    imageUrl: null,
    levels: [level("1", "Fencing Club", 20)]
  })
]

describe("groupInventory", () => {
  it("groups variants under products with totals and natural ordering", () => {
    const products = groupInventory(rows)
    expect(products.map((product) => product.title)).toEqual(["Body cord", "Pro-grip glove"])
    const [cord, glove] = products
    expect(cord).toMatchObject({ available: 20, variants: [{ title: null, sku: "sku-3" }] })
    expect(glove).toMatchObject({ available: 6, imageUrl: "https://cdn.shopify.com/right.jpg" })
    expect(glove?.variants.map((variant) => [variant.title, variant.available])).toEqual([
      ["Right / 6", 3],
      ["Right / 10", 3]
    ])
  })

  it("keeps unknown quantities unknown instead of counting them as zero", () => {
    const [glove] = groupInventory(rows, { locationId: "gid://shopify/Location/2" })
    expect(glove?.variants.map((variant) => variant.available)).toEqual([4, null])
    expect(glove?.available).toBe(4)
  })

  it("filters by location and by product, variation, or SKU search", () => {
    expect(groupInventory(rows, { locationId: "gid://shopify/Location/2" }).map((p) => p.title)).toEqual([
      "Pro-grip glove"
    ])
    expect(groupInventory(rows, { query: "right / 6" })[0]?.variants.map((v) => v.sku)).toEqual(["sku-2"])
    expect(groupInventory(rows, { query: "SKU-3" }).map((p) => p.title)).toEqual(["Body cord"])
  })

  it("falls back to the SKU for snapshots saved before product details were collected", () => {
    const legacy = [{ ...row(4, 0, { levels: [level("1", "Fencing Club", 1)] }), productId: undefined }]
    expect(groupInventory(legacy)).toMatchObject([{ productId: "gid://shopify/ProductVariant/4", title: "sku-4" }])
  })

  it("leaves Shopify Collective stock out unless asked for", () => {
    const collective = { ...level("3", "Partner via Collective", 50), locationKind: "shopify_collective" as const }
    const own = { ...level("1", "Fencing Club", 2), locationKind: "merchant" as const }
    const stock = [
      row(5, 30, { productTitle: "Mixed", levels: [own, collective] }),
      row(6, 40, { productTitle: "Partner shoe", levels: [collective] })
    ]
    expect(groupInventory(stock).map((p) => [p.title, p.available])).toEqual([["Mixed", 2]])
    expect(groupInventory(stock, { includeCollective: true }).map((p) => [p.title, p.available])).toEqual([
      ["Mixed", 52],
      ["Partner shoe", 50]
    ])
    expect(inventoryLocations(stock).map((location) => [location.name, location.kind])).toEqual([
      ["Fencing Club", "merchant"],
      ["Partner via Collective", "shopify_collective"]
    ])
  })
})

describe("stock kinds", () => {
  const kinds = [
    row(4, 30, {
      productTitle: "Complete pistol",
      variantTitle: "Medium",
      bundle: { available: 9 },
      levels: [level("1", "Fencing Club", null)]
    }),
    row(5, 30, {
      productTitle: "Complete pistol",
      variantTitle: "Hard",
      bundle: { available: 18 },
      levels: [level("1", "Fencing Club", null)]
    }),
    row(6, 40, { productTitle: "Gift card", tracked: false, levels: [level("1", "Fencing Club", 5)] })
  ]

  it("uses Shopify's store-wide bundle availability and leaves stock counts unknown", () => {
    const [pistol] = groupInventory(kinds)
    expect(pistol).toMatchObject({ stock: "bundle", available: 27, onHand: null, incoming: null })
    expect(pistol?.variants.map((variant) => [variant.stock, variant.available])).toEqual([
      ["bundle", 18],
      ["bundle", 9]
    ])
  })

  it("doesn't claim a bundle quantity for a single location", () => {
    const [pistol] = groupInventory(kinds, { locationId: "gid://shopify/Location/1" })
    expect(pistol?.available).toBeNull()
  })

  it("reports no quantities for untracked products", () => {
    const [, card] = groupInventory(kinds)
    expect(card).toMatchObject({ stock: "untracked", available: null, onHand: null, incoming: null })
  })
})

describe("on order", () => {
  const item = (variant: number, pieces: number, piecesPerSet = 1) => ({
    variantId: `gid://shopify/ProductVariant/${variant}`,
    pieces,
    piecesPerSet
  })
  const order = (id: string, reference: string, items: ReturnType<typeof item>[]) => ({
    id,
    data: { reference, items }
  })

  it("counts sellable units per variant and totals them per product with each PO once", () => {
    const onOrder = onOrderByVariant([
      order("a", "PO-1", [item(1, 24, 2), item(2, 5)]),
      order("b", "PO-2", [item(1, 7, 2)])
    ])
    expect(onOrder.get("gid://shopify/ProductVariant/1")).toEqual({
      units: 15,
      orders: [
        { id: "a", reference: "PO-1" },
        { id: "b", reference: "PO-2" }
      ]
    })
    const glove = groupInventory(rows, { onOrder }).find((product) => product.title === "Pro-grip glove")
    expect(glove?.onOrder).toEqual({
      units: 20,
      orders: [
        { id: "a", reference: "PO-1" },
        { id: "b", reference: "PO-2" }
      ]
    })
    const cord = groupInventory(rows, { onOrder }).find((product) => product.title === "Body cord")
    expect(cord?.onOrder).toEqual({ units: 0, orders: [] })
  })
})
