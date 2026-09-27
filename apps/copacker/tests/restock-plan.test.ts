import { describe, expect, it } from "vitest"
import { restockPlan, supplierLeadTime } from "../src/server/restock-plan"
import type { DemandRow } from "../src/server/sales-attribution"

const variantId = "gid://shopify/ProductVariant/1"
const catalog: Parameters<typeof restockPlan>[0]["catalog"] = [
  {
    variantId,
    inventoryItemId: "gid://shopify/InventoryItem/1",
    buyerSku: "SKU",
    productId: "gid://shopify/Product/1",
    productTitle: "Foil cord",
    variantTitle: "Standard",
    tracked: true,
    unit: "shopify_inventory_unit",
    levels: [
      {
        locationId: "gid://shopify/Location/1",
        locationName: "Our warehouse",
        available: 80,
        onHand: 100,
        committed: 20,
        incoming: 0
      },
      {
        locationId: "gid://shopify/Location/2",
        locationName: "Amazon mirror",
        available: 500,
        onHand: 500,
        committed: 0,
        incoming: 0
      },
      {
        locationId: "gid://shopify/Location/3",
        locationName: "Other",
        available: 10,
        onHand: 10,
        committed: 0,
        incoming: 0
      }
    ]
  }
]
const classifications = new Map([
  ["gid://shopify/Location/1", "merchant"],
  ["gid://shopify/Location/2", "amazon_mirror"],
  ["gid://shopify/Location/3", "merchant"]
] as const)
const row = (pool: DemandRow["pool"], locationId: string | null, fulfilledUnits: number): DemandRow => ({
  variantId: pool === "shopify" ? variantId : null,
  buyerSku: "SKU",
  locationId,
  pool,
  bundleVariantId: null,
  fulfilledUnits
})
const base = {
  catalog,
  classifications,
  onOrder: new Map(),
  salesDays: 56,
  leadTimeDays: 56,
  shopifySales: {
    rows: [
      row("shopify", "gid://shopify/Location/1", 112),
      row("shopify", "gid://shopify/Location/3", 999),
      row("shopify", "gid://shopify/Location/2", 500)
    ],
    gaps: []
  },
  amazonSales: { rows: [row("fba", null, 112), row("fbm_unassigned", null, 1000)], gaps: [] },
  fbaRows: [
    {
      sellerSku: "SKU",
      unit: "amazon_sellable_unit" as const,
      totalQuantity: 40,
      inventoryDetails: {
        fulfillableQuantity: 40,
        inboundWorkingQuantity: 0,
        inboundShippedQuantity: 0,
        inboundReceivingQuantity: 0
      }
    }
  ],
  awdRows: [
    {
      sellerSku: "SKU",
      unit: "amazon_sellable_unit" as const,
      inbound: 0,
      onHand: 30,
      availableDistributable: 30,
      reservedDistributable: 0,
      replenishment: 0
    }
  ],
  productDefaults: new Map(),
  supplierFor: () => null
}
const supplier = { id: "00000000-0000-4000-8000-000000000001", name: "Maker", leadTimeDays: 42, amazonLeadTimeDays: 28 }
const shopify = { kind: "shopify" as const, locationId: "gid://shopify/Location/1" }
const amazon = { kind: "amazon" as const }

describe("restock plan", () => {
  it("restocks one Shopify location from its own stock and sales, never the Amazon mirror", () => {
    expect(restockPlan({ ...base, channel: shopify })).toMatchObject([
      { sku: "SKU", status: "stockout", sold: 112, available: 80, need: 32, purchaseUnits: 32, daysRemaining: 40 }
    ])
  })
  it("estimates the sales lost between running out and a reorder placed today arriving", () => {
    // 2 a day: 80 units last 40 days of the 56-day lead time, so 16 days, 32 sales, go unsold.
    const [line] = restockPlan({
      ...base,
      channel: shopify,
      catalog: catalog.map((row) => ({
        ...row,
        priceMinor: 1500,
        priceCurrency: "USD",
        unitCostMinor: 500,
        costCurrency: "USD"
      }))
    })
    expect(line).toMatchObject({ lostDays: 16, lostUnits: 32, lostSalesMinor: 48000, lostProfitMinor: 32000 })
    // Without a price, the units are still known.
    expect(restockPlan({ ...base, channel: shopify })[0]).toMatchObject({ lostUnits: 32, lostSalesMinor: null })
  })
  it("rounds to the case quantity, raises to the minimum order and estimates cost", () => {
    const [line] = restockPlan({
      ...base,
      channel: shopify,
      catalog: catalog.map((row) => ({ ...row, caseQuantity: 6, unitCostMinor: 500, costCurrency: "USD" }))
    })
    expect(line).toMatchObject({ purchaseUnits: 36, caseCount: 6, estimatedCostMinor: 18000, costCurrency: "USD" })
    const [minimum] = restockPlan({
      ...base,
      channel: shopify,
      productDefaults: new Map([["gid://shopify/Product/1", { casePacks: [], minimumOrder: 50 }]])
    })
    expect(minimum).toMatchObject({ need: 32, minimumOrder: 50, purchaseUnits: 50 })
  })
  it("treats Amazon as one channel: FBA and AWD stock together, and FBA and FBM sales", () => {
    expect(restockPlan({ ...base, channel: amazon })).toMatchObject([
      { sku: "SKU", available: 70, incoming: 0, sold: 1112, purchaseUnits: 1042, status: "stockout" }
    ])
  })
  it("counts open Amazon POs as incoming, but not both a PO and Amazon's inbound for the same stock", () => {
    const onOrder = new Map([
      [variantId, [{ id: "po", reference: "PO-1", units: 100, locationIds: [], destination: "amazon" as const }]]
    ])
    expect(restockPlan({ ...base, channel: amazon, onOrder })[0]).toMatchObject({ incoming: 100, purchaseUnits: 942 })
    const shipped = base.fbaRows.map((row) => ({
      ...row,
      inventoryDetails: { ...row.inventoryDetails, inboundShippedQuantity: 100 }
    }))
    expect(restockPlan({ ...base, channel: amazon, onOrder, fbaRows: shipped })[0]).toMatchObject({ incoming: 100 })
  })
  it("tops up to the Amazon stock target, and marks target zero as not stocked", () => {
    const [target] = restockPlan({
      ...base,
      channel: amazon,
      catalog: catalog.map((row) => ({ ...row, amazonStockTarget: 1 })),
      fbaRows: [],
      awdRows: []
    })
    // Amazon has no inventory for the SKU: there's no listing to send stock to yet.
    expect(target).toMatchObject({ targetStock: 1, status: "no_listing", purchaseUnits: null })
    const [emptyListing] = restockPlan({
      ...base,
      channel: amazon,
      catalog: catalog.map((row) => ({ ...row, amazonStockTarget: 1 })),
      fbaRows: base.fbaRows.map((row) => ({
        ...row,
        totalQuantity: 0,
        inventoryDetails: { ...row.inventoryDetails, fulfillableQuantity: 0 }
      })),
      awdRows: []
    })
    // An FBA listing with no stock tops up to the target: 1112 sold plus a target of 1.
    expect(emptyListing).toMatchObject({ targetStock: 1, available: 0, purchaseUnits: 1113, status: "stockout" })
    const [notStocked] = restockPlan({
      ...base,
      channel: amazon,
      catalog: catalog.map((row) => ({ ...row, amazonStockTarget: 0 }))
    })
    expect(notStocked).toMatchObject({ status: "not_stocked", purchaseUnits: 0 })
  })
  it("leaves out listings Amazon holds no stock of and has no target for, even with FBM sales", () => {
    expect(restockPlan({ ...base, channel: amazon, fbaRows: [], awdRows: [] })).toEqual([])
  })
  it("uses the supplier's lead time for the channel", () => {
    const withSupplier = { ...base, supplierFor: () => supplier }
    expect(restockPlan({ ...withSupplier, channel: amazon })[0]).toMatchObject({
      supplier: { id: supplier.id, name: "Maker" },
      leadTimeDays: 28,
      purchaseUnits: 486
    })
    expect(restockPlan({ ...withSupplier, channel: shopify })[0]).toMatchObject({ leadTimeDays: 42 })
    expect(supplierLeadTime({ ...supplier, amazonLeadTimeDays: null }, amazon, 56)).toBe(42)
    expect(supplierLeadTime(null, amazon, 56)).toBe(56)
  })
  it("can't calculate a line whose sales have an attribution gap", () => {
    const [line] = restockPlan({
      ...base,
      channel: shopify,
      shopifySales: {
        rows: base.shopifySales.rows,
        gaps: [
          {
            sourceName: "web",
            locationId: null,
            orderId: "o1",
            variantId,
            buyerSku: "SKU",
            reason: "unfulfilled",
            units: 3
          }
        ]
      }
    })
    expect(line).toMatchObject({ status: "blocked", blocked: ["demand_unknown"], purchaseUnits: null, need: null })
  })
  it("can't calculate an Amazon line whose SKU matches more than one product", () => {
    const [line] = restockPlan({
      ...base,
      channel: amazon,
      catalog: [...catalog, { ...catalog[0]!, variantId: "gid://shopify/ProductVariant/2", levels: [] }]
    })
    expect(line).toMatchObject({ status: "blocked", blocked: ["sku_ambiguous"] })
  })
  it("measures the sales rate over the days the item was in stock", () => {
    const [line] = restockPlan({ ...base, channel: shopify, stockoutsFor: () => 28 })
    // 112 sold in the 28 days it was in stock is 4 a day: 224 over the lead time, less 80 available.
    expect(line).toMatchObject({ stockoutDays: 28, rateDays: 28, purchaseUnits: 144 })
    // A week is the shortest period the rate is measured over.
    expect(restockPlan({ ...base, channel: shopify, stockoutsFor: () => 60 })[0]).toMatchObject({
      stockoutDays: 56,
      rateDays: 7
    })
  })
  it("keeps Shopify's store stock target at the store's location", () => {
    const [line] = restockPlan({
      ...base,
      channel: shopify,
      catalog: catalog.map((row) => ({ ...row, storeStockTarget: 20 }))
    })
    // 112 over the lead time plus 20 to keep, less 80 available.
    expect(line).toMatchObject({ targetStock: 20, targetWhere: "Our warehouse", purchaseUnits: 52 })
  })
  it("names the Shopify supplier of a product ordered outside Copacker", () => {
    const [outside] = restockPlan({ ...base, channel: shopify, externalSupplierFor: () => "Fence With Fun" })
    expect(outside).toMatchObject({ supplier: null, externalSupplier: "Fence With Fun" })
    const [inside] = restockPlan({
      ...base,
      channel: shopify,
      supplierFor: () => supplier,
      externalSupplierFor: () => "Fence With Fun"
    })
    expect(inside).toMatchObject({ supplier: { name: "Maker" }, externalSupplier: null })
  })
  it("shows enough stock when nothing needs ordering", () => {
    const [line] = restockPlan({ ...base, channel: shopify, shopifySales: { rows: [], gaps: [] } })
    expect(line).toMatchObject({ status: "stocked", sold: 0, purchaseUnits: 0 })
  })
})
