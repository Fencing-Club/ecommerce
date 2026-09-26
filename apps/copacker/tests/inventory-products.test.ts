import { describe, expect, it } from "vitest"
import { groupInventory, inventoryLocations, onOrderByVariant, withAmazonStock } from "../src/server/inventory-products"

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

  it("leaves excluded locations out unless asked for", () => {
    const collective = level("3", "Partner via Collective", 50)
    const own = level("1", "Fencing Club", 2)
    const stock = [
      row(5, 30, { productTitle: "Mixed", levels: [own, collective] }),
      row(6, 40, { productTitle: "Partner shoe", levels: [collective] })
    ]
    const classifications = new Map([
      ["gid://shopify/Location/1", "merchant" as const],
      ["gid://shopify/Location/3", "excluded" as const]
    ])
    expect(groupInventory(stock, { classifications }).map((p) => [p.title, p.available])).toEqual([["Mixed", 2]])
    expect(
      groupInventory(stock, { classifications, includeExcluded: true }).map((p) => [p.title, p.available])
    ).toEqual([
      ["Mixed", 52],
      ["Partner shoe", 50]
    ])
    // The Products page lists every product; one stocked only at excluded locations counts none.
    expect(
      groupInventory(stock, { classifications, everyProduct: true }).map((p) => [p.title, p.available, p.onHand])
    ).toEqual([
      ["Mixed", 2, 2],
      ["Partner shoe", 0, 0]
    ])
    expect(
      inventoryLocations(stock, classifications).map((location) => [location.name, location.classification])
    ).toEqual([
      ["Fencing Club", "merchant"],
      ["Partner via Collective", "excluded"]
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
    id: `item-${variant}-${pieces}`,
    variantId: `gid://shopify/ProductVariant/${variant}`,
    pieces,
    piecesPerSet
  })
  const order = (
    id: string,
    reference: string,
    items: ReturnType<typeof item>[],
    destination: "awd_us" | "forwarder" = "awd_us"
  ) => ({ id, data: { reference, destination, items } })

  it("counts sellable units per variant and totals them per product with each PO once", () => {
    const onOrder = onOrderByVariant([
      order("a", "PO-1", [item(1, 24, 2), item(2, 5)]),
      order("b", "PO-2", [item(1, 7, 2)])
    ])
    expect(onOrder.get("gid://shopify/ProductVariant/1")).toEqual([
      { id: "a", reference: "PO-1", units: 12, locationIds: ["amazon:awd"], destination: "awd_us" },
      { id: "b", reference: "PO-2", units: 3, locationIds: ["amazon:awd"], destination: "awd_us" }
    ])
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

  it("shows POs to a delivery address at its linked Shopify location", () => {
    const toWarehouse = {
      id: "w",
      data: { reference: "PO-W", destination: "warehouse" as const, deliveryId: "delivery-1", items: [item(1, 6)] }
    }
    const onOrder = onOrderByVariant([toWarehouse], new Map([["delivery-1", "gid://shopify/Location/1"]]))
    expect(onOrder.get("gid://shopify/ProductVariant/1")?.[0]?.locationIds).toEqual(["gid://shopify/Location/1"])
    const unlinked = onOrderByVariant([toWarehouse], new Map([["delivery-1", null]]))
    expect(unlinked.get("gid://shopify/ProductVariant/1")?.[0]?.locationIds).toEqual([])
  })

  it("leaves received pieces off order", () => {
    const onOrder = onOrderByVariant([{ ...order("a", "PO-1", [item(1, 24, 2)]), received: { "item-1-24": 10 } }])
    expect(onOrder.get("gid://shopify/ProductVariant/1")?.[0]?.units).toBe(7)
  })

  it("shows units only at the location the PO will stock", () => {
    const onOrder = onOrderByVariant([order("a", "PO-1", [item(1, 10)]), order("b", "PO-2", [item(1, 4)], "forwarder")])
    const pooled = withAmazonStock(rows, null, [
      {
        sellerSku: "sku-1",
        unit: "amazon_sellable_unit",
        inbound: 0,
        onHand: 5,
        availableDistributable: 5,
        reservedDistributable: null,
        replenishment: null
      }
    ]).rows
    const units = (locationId?: string) =>
      groupInventory(pooled, { onOrder, classifications: counted, locationId }).find(
        (product) => product.title === "Pro-grip glove"
      )?.onOrder.units
    // AWD-bound stock appears at the AWD pool; forwarder stock has no location yet.
    expect(units()).toBe(14)
    expect(units("amazon:awd")).toBe(10)
    expect(units("gid://shopify/Location/1")).toBe(0)
  })
})

describe("Amazon stock", () => {
  const fba = (sellerSku: string, fulfillable: number, total: number, inbound = 0) => ({
    sellerSku,
    unit: "amazon_sellable_unit" as const,
    totalQuantity: total,
    inventoryDetails: {
      fulfillableQuantity: fulfillable,
      inboundWorkingQuantity: inbound,
      inboundShippedQuantity: 0,
      inboundReceivingQuantity: 0
    }
  })
  const awdRow = (sellerSku: string, available: number, onHand: number, inbound: number) => ({
    sellerSku,
    unit: "amazon_sellable_unit" as const,
    availableDistributable: available,
    onHand,
    inbound,
    reservedDistributable: null,
    replenishment: null
  })

  it("adds FBA and AWD to the Shopify variant with the same SKU and totals every pool", () => {
    const { rows: pooled, amazonOnly } = withAmazonStock(
      rows,
      // FBA reports a SKU once per condition; the rows add up.
      [fba("sku-3", 4, 5, 2), fba("sku-3", 1, 1), fba("amzn.gr.sku-3-XYZ", 1, 1), fba("unknown", 2, 2)],
      [awdRow("sku-3", 30, 30, 10)]
    )
    const [cord] = groupInventory(pooled, { classifications: counted })
    expect(cord).toMatchObject({
      title: "Body cord",
      available: 20 + 5 + 30,
      onHand: 20 + 6 + 30,
      incoming: 0 + 2 + 10
    })
    expect(cord?.variants[0]?.levels.map((level) => [level.locationName, level.available])).toEqual([
      ["Fencing Club", 20],
      ["Amazon FBA", 5],
      ["Amazon AWD", 30]
    ])
    expect(amazonOnly.map((stock) => [stock.sku, stock.resold])).toEqual([
      ["amzn.gr.sku-3-XYZ", true],
      ["unknown", false]
    ])
  })

  it("leaves Shopify's Amazon mirror out of the totals", () => {
    const glove = groupInventory(rows, { classifications: counted }).find(
      (product) => product.title === "Pro-grip glove"
    )
    // Location 2 mirrors Amazon, so only the store's own location counts.
    expect(glove?.available).toBe(2)
  })
})

const counted = new Map([
  ["gid://shopify/Location/1", "merchant" as const],
  ["gid://shopify/Location/2", "amazon_mirror" as const],
  ["amazon:fba", "merchant" as const],
  ["amazon:awd", "merchant" as const]
])
