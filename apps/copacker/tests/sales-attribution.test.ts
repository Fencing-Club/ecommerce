import type { AmazonSale, ShopifySale } from "@repo/aisle/sales"
import { describe, expect, it } from "vitest"
import { attributeAmazonSales, attributeShopifySales, summarizeDemandGaps } from "../src/server/sales-attribution"
it("separates unfulfilled units from mapping failures and unknown quantities", () => {
  expect(
    summarizeDemandGaps([
      {
        sourceName: "web",
        locationId: null,
        orderId: "1",
        variantId: "v",
        buyerSku: "A",
        reason: "unfulfilled",
        units: 5
      },
      {
        sourceName: "app",
        locationId: null,
        orderId: "2",
        variantId: "v",
        buyerSku: "A",
        reason: "channel_unmapped",
        units: 3
      },
      {
        sourceName: "web",
        locationId: null,
        orderId: "3",
        variantId: "v",
        buyerSku: "A",
        reason: "quantity_unknown",
        units: null
      }
    ])
  ).toEqual({
    unfulfilled: { units: 5, unknownCount: 0 },
    channel_unmapped: { units: 3, unknownCount: 0 },
    quantity_unknown: { units: 0, unknownCount: 1 }
  })
})
const order: ShopifySale = {
  id: "order1",
  name: "#1001",
  createdAt: "2026-08-20T00:00:00Z",
  cancelledAt: null,
  test: false,
  sourceName: "web",
  lines: [{ id: "line1", quantity: 4, currentQuantity: 4, sku: "SKU", variant: { id: "v1" } }],
  fulfillments: [
    {
      id: "f1",
      status: "SUCCESS",
      location: { id: "local" },
      lines: [{ id: "fl1", quantity: 2, lineItem: { id: "line1" } }]
    },
    {
      id: "f2",
      status: "SUCCESS",
      location: { id: "amazon" },
      lines: [{ id: "fl2", quantity: 2, lineItem: { id: "line1" } }]
    }
  ]
}
const amazon: AmazonSale = {
  orderId: "a1",
  createdTime: "2026-08-20T00:00:00Z",
  salesChannel: { channelName: "AMAZON", marketplaceId: "ATVPDKIKX0DER" },
  fulfillment: { fulfillmentStatus: "SHIPPED", fulfilledBy: "AMAZON" },
  orderItems: [
    {
      orderItemId: "i1",
      quantityOrdered: 2,
      product: { sellerSku: "SKU" },
      fulfillment: { quantityFulfilled: 2, quantityUnfulfilled: 0 }
    }
  ]
}
describe("sales demand attribution", () => {
  it("counts only the selected merchant warehouse and excludes Amazon mirrors", () => {
    const result = attributeShopifySales(
      [order],
      new Map([
        ["local", "merchant"],
        ["amazon", "amazon_mirror"]
      ])
    )
    expect(result).toMatchObject({
      attributionComplete: true,
      excludedFulfilledUnits: 2,
      rows: [{ pool: "shopify", locationId: "local", fulfilledUnits: 2 }]
    })
  })
  it("does not guess marketplace integration source names or warehouse mappings", () => {
    expect(attributeShopifySales([{ ...order, sourceName: "123456-app" }], new Map()).gaps[0]?.reason).toBe(
      "channel_unmapped"
    )
    const result = attributeShopifySales([order], new Map())
    expect(result.rows).toHaveLength(0)
    expect(result.gaps.map((gap) => gap.reason)).toEqual(["location_unmapped", "location_unmapped"])
    expect(result.gaps.map((gap) => gap.locationId)).toEqual(["local", "amazon"])
    expect(result.gaps.every((gap) => gap.sourceName === "web")).toBe(true)
    const imported = attributeShopifySales([{ ...order, sourceName: "123456-app" }], new Map())
    expect(imported.gaps[0]).toMatchObject({ sourceName: "123456-app", locationId: null, reason: "channel_unmapped" })
  })
  it("keeps unfulfilled demand and unknown quantities explicit", () => {
    expect(
      attributeShopifySales([{ ...order, fulfillments: [order.fulfillments[0]!] }], new Map([["local", "merchant"]]))
        .gaps[0]
    ).toMatchObject({ reason: "unfulfilled", units: 2 })
    expect(
      attributeShopifySales(
        [
          {
            ...order,
            fulfillments: [
              { ...order.fulfillments[0]!, lines: [{ id: "null", quantity: null, lineItem: { id: "line1" } }] }
            ]
          }
        ],
        new Map()
      ).gaps[0]?.reason
    ).toBe("quantity_unknown")
  })
  it("excludes tests and cancellations but does not assume refunds restore stock", () => {
    expect(
      attributeShopifySales(
        [
          { ...order, test: true },
          { ...order, cancelledAt: "date" }
        ],
        new Map()
      ).rows
    ).toHaveLength(0)
    const refunded = { ...order, lines: [{ ...order.lines[0]!, currentQuantity: 0 }] }
    expect(
      attributeShopifySales(
        [refunded],
        new Map([
          ["local", "merchant"],
          ["amazon", "amazon_mirror"]
        ])
      ).rows[0]?.fulfilledUnits
    ).toBe(2)
  })
  it("separates Amazon FBA and unassigned FBM without inventing AWD sales", () => {
    const result = attributeAmazonSales([
      amazon,
      { ...amazon, orderId: "a2", fulfillment: { fulfillmentStatus: "SHIPPED", fulfilledBy: "MERCHANT" } }
    ])
    expect(result.rows.map((row) => [row.pool, row.fulfilledUnits, row.locationId])).toEqual([
      ["fba", 2, null],
      ["fbm_unassigned", 2, null]
    ])
  })
  it("does not treat absent Amazon quantities as zero or attribute non-Amazon orders", () => {
    expect(
      attributeAmazonSales([{ ...amazon, orderItems: [{ ...amazon.orderItems[0]!, fulfillment: undefined }] }]).gaps[0]
        ?.reason
    ).toBe("quantity_unknown")
    expect(attributeAmazonSales([{ ...amazon, salesChannel: { channelName: "NON_AMAZON" } }]).gaps[0]?.reason).toBe(
      "channel_unmapped"
    )
  })
  it("separates confirmed unfulfilled demand by pool without increasing fulfilled sales", () => {
    const partial = {
      ...amazon,
      fulfillment: { fulfillmentStatus: "PARTIALLY_SHIPPED", fulfilledBy: "AMAZON" },
      orderItems: [
        { ...amazon.orderItems[0]!, quantityOrdered: 5, fulfillment: { quantityFulfilled: 2, quantityUnfulfilled: 3 } }
      ]
    }
    const result = attributeAmazonSales([
      partial,
      { ...partial, orderId: "second" },
      {
        ...partial,
        orderId: "merchant",
        fulfillment: { fulfillmentStatus: "UNSHIPPED", fulfilledBy: "MERCHANT" },
        orderItems: [
          {
            ...amazon.orderItems[0]!,
            quantityOrdered: 5,
            fulfillment: { quantityFulfilled: 0, quantityUnfulfilled: 5 }
          }
        ]
      }
    ])
    expect(result.confirmedUnfulfilled).toEqual([
      { buyerSku: "SKU", pool: "fba", units: 6 },
      { buyerSku: "SKU", pool: "fbm_unassigned", units: 5 }
    ])
    expect(result.rows.find((row) => row.pool === "fba")?.fulfilledUnits).toBe(4)
    expect(result.attributionComplete).toBe(true)
  })
  it("does not count pending payment or cancelled orders as confirmed demand", () => {
    const orders = ["PENDING", "PENDING_AVAILABILITY", "CANCELLED", "UNFULFILLABLE"].map((fulfillmentStatus) => ({
      ...amazon,
      fulfillment: { fulfillmentStatus, fulfilledBy: "AMAZON" },
      orderItems: [{ ...amazon.orderItems[0]!, fulfillment: { quantityFulfilled: 0, quantityUnfulfilled: 2 } }]
    }))
    expect(attributeAmazonSales(orders).confirmedUnfulfilled).toEqual([])
  })
  it("rejects overlapping fulfilled and unfulfilled quantities", () => {
    expect(() =>
      attributeAmazonSales([
        {
          ...amazon,
          orderItems: [{ ...amazon.orderItems[0]!, fulfillment: { quantityFulfilled: 2, quantityUnfulfilled: 1 } }]
        }
      ])
    ).toThrow("quantities exceed")
  })
  it("rejects inconsistent quantities rather than multiplying demand", () => {
    expect(() =>
      attributeShopifySales([{ ...order, fulfillments: [...order.fulfillments, order.fulfillments[0]!] }], new Map())
    ).toThrow("inconsistent")
    expect(() =>
      attributeAmazonSales([
        { ...amazon, orderItems: [{ ...amazon.orderItems[0]!, fulfillment: { quantityFulfilled: 3 } }] }
      ])
    ).toThrow("exceeds")
  })
})
