import { describe, expect, it } from "vitest"
import { restockPoolReport } from "../src/server/restock-pool-report"
import type { DemandRow } from "../src/server/sales-attribution"

const variantId = "gid://shopify/ProductVariant/1"
const catalog: Parameters<typeof restockPoolReport>[0]["catalog"] = [
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
  fbaStock: {
    source: "fba" as const,
    scopeKey: "ATVPDKIKX0DER" as const,
    startedAt: "2026-09-25T00:00:00Z",
    observedAt: "2026-09-25T00:00:00Z",
    rows: [
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
    ]
  },
  awdStock: {
    source: "awd" as const,
    scopeKey: "us" as const,
    startedAt: "2026-09-25T00:00:00Z",
    observedAt: "2026-09-25T00:00:00Z",
    rows: [
      {
        sellerSku: "SKU",
        unit: "amazon_sellable_unit" as const,
        inbound: 0,
        onHand: 30,
        availableDistributable: 30,
        reservedDistributable: 0,
        replenishment: 0
      }
    ]
  }
}

describe("location-specific restock report", () => {
  it("does not mix Shopify locations or Amazon mirror stock and demand", () => {
    const result = restockPoolReport({
      ...base,
      target: {
        pool: "shopify",
        locationId: "gid://shopify/Location/1"
      }
    })
    expect(result.reorder).toMatchObject([{ sku: "SKU", purchaseUnits: 32 }])
  })
  it("rounds to the product's case quantity and estimates cost from Shopify's unit cost", () => {
    const result = restockPoolReport({
      ...base,
      target: { pool: "shopify", locationId: "gid://shopify/Location/1" },
      catalog: catalog.map((row) => ({ ...row, caseQuantity: 6, unitCostMinor: 500, costCurrency: "USD" }))
    })
    expect(result.reorder).toMatchObject([
      { sku: "SKU", purchaseUnits: 36, caseCount: 6, estimatedCostMinor: 18000, costCurrency: "USD" }
    ])
  })
  it("keeps FBA and AWD inventory separate while using FBA demand for both", () => {
    expect(restockPoolReport({ ...base, target: { pool: "fba" } }).reorder).toMatchObject([
      { sku: "SKU", purchaseUnits: 72 }
    ])
    expect(restockPoolReport({ ...base, target: { pool: "awd" } }).reorder).toMatchObject([
      { sku: "SKU", purchaseUnits: 82 }
    ])
  })
  it("treats a stocked Amazon SKU missing from a complete inventory snapshot as zero, but respects target zero", () => {
    const stocked = catalog.map((row) => ({ ...row, amazonStockTarget: 1 }))
    const absent = restockPoolReport({
      ...base,
      catalog: stocked,
      target: { pool: "fba" },
      fbaStock: { ...base.fbaStock, rows: [] }
    })
    // 112 units of lead-time demand plus the Amazon stock target of 1 to keep on hand, as in Aisle.
    expect(absent.reorder).toMatchObject([{ sku: "SKU", purchaseUnits: 113 }])
    const notStocked = restockPoolReport({
      ...base,
      catalog: catalog.map((row) => ({ ...row, amazonStockTarget: 0 })),
      target: { pool: "fba" },
      fbaStock: { ...base.fbaStock, rows: [] }
    })
    expect(notStocked.reorder).toEqual([])
  })
  it("withholds a PO quantity when the selected pool has an attribution gap", () => {
    const result = restockPoolReport({
      ...base,
      target: { pool: "shopify", locationId: "gid://shopify/Location/1" },
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
    expect(result.reorder).toEqual([])
    expect(result.suggestions.get(variantId)?.purchaseUnits).toBeNull()
  })
  it("reports Amazon stock SKUs that cannot be mapped uniquely to Shopify", () => {
    const result = restockPoolReport({
      ...base,
      target: { pool: "fba" },
      fbaStock: {
        ...base.fbaStock,
        rows: [...base.fbaStock.rows, { ...base.fbaStock.rows[0]!, sellerSku: "UNMAPPED" }]
      }
    })
    expect(result.unmatchedStockSkus).toBe(1)
    expect(result.reorder).toMatchObject([{ sku: "SKU", purchaseUnits: 72 }])
  })
})
