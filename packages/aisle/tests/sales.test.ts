import { describe, expect, it, vi } from "vitest"
import {
  collectAmazonTransactions,
  collectShopifyBalanceTransactions,
  shopifyPaymentFees,
  collectShopifySales,
  collectShopifySalesBulk,
  collectAmazonSales,
  collectAmazonSalesReport,
  shopifyOrderWithCustomerQuery,
  shopifySalesQueries,
  transactionFees
} from "../src/sales"
const window = { from: "2026-08-01T00:00:00Z", to: "2026-09-01T00:00:00Z" }
const pageInfo = { hasNextPage: false, endCursor: null }
const header = {
  id: "order1",
  name: "#1001",
  createdAt: "2026-08-20T00:00:00Z",
  cancelledAt: null,
  test: false,
  sourceName: "web",
  tags: ["Wholesale"]
}
const line = { id: "line1", quantity: 2, currentQuantity: 2, sku: "SKU", variant: { id: "variant1" } }
function shopify() {
  const graphql = vi
    .fn<(_query: string, _variables?: Record<string, unknown>) => Promise<unknown>>()
    .mockResolvedValueOnce({ shop: { myshopifyDomain: "test.myshopify.com" }, orders: { nodes: [header], pageInfo } })
    .mockResolvedValueOnce({
      order: {
        ...header,
        lineItems: { nodes: [line], pageInfo },
        fulfillmentsCount: { count: 1, precision: "EXACT" },
        transactions: [],
        fulfillments: [
          {
            id: "fulfillment1",
            status: "SUCCESS",
            createdAt: "2026-08-20T01:00:00Z",
            inTransitAt: "2026-08-21T01:00:00Z",
            location: { id: "location1" }
          }
        ]
      }
    })
    .mockResolvedValueOnce({
      fulfillment: {
        id: "fulfillment1",
        fulfillmentLineItems: { nodes: [{ id: "fl1", quantity: 2, lineItem: { id: "line1" } }], pageInfo }
      }
    })
  return { graphql }
}
const amazonOrder = {
  orderId: "o1",
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
describe("complete sales readers", () => {
  it("fetches Shopify fulfillment identity and avoids customer data", async () => {
    const api = shopify(),
      active = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const result = await collectShopifySales(api, "test.myshopify.com", window, active)
    expect(result[0]?.fulfillments[0]?.lines[0]?.quantity).toBe(2)
    expect(result[0]?.fulfillments[0]).toMatchObject({
      createdAt: "2026-08-20T01:00:00Z",
      inTransitAt: "2026-08-21T01:00:00Z"
    })
    expect(result[0]?.tags).toEqual(["Wholesale"])
    expect(api.graphql).toHaveBeenCalledWith(shopifySalesQueries.orders, {
      query: `created_at:>='${window.from}' created_at:<'${window.to}'`,
      after: null
    })
    expect(active).toHaveBeenCalledTimes(6)
    expect(Object.values(shopifySalesQueries).join(" ")).not.toMatch(/email|address|customer/i)
    expect(result[0]).not.toHaveProperty("customerId")
  })
  it("copies each order's customer ID when asked, and nothing else about the customer", async () => {
    const api = shopify()
    const result = await collectShopifySales(
      {
        graphql: async (query, variables) => {
          const response = (await api.graphql(query, variables)) as { order?: Record<string, unknown> }
          return response.order
            ? { order: { ...response.order, customer: { id: "gid://shopify/Customer/1" } } }
            : response
        }
      },
      "test.myshopify.com",
      window,
      undefined,
      { customers: true }
    )
    expect(result[0]?.customerId).toBe("gid://shopify/Customer/1")
    expect(api.graphql.mock.calls[1]?.[0]).toBe(shopifyOrderWithCustomerQuery)
    // Only the customer's ID is added to the order query.
    expect(
      shopifyOrderWithCustomerQuery.replace(shopifySalesQueries.order.split("{order(id:$id){")[0]!, "")
    ).not.toMatch(/email|address|phone|firstName|lastName|displayName/i)
    expect(shopifyOrderWithCustomerQuery).toContain("customer{id}")
  })
  it("follows nested line and fulfillment line pagination", async () => {
    const api = shopify()
    api.graphql.mockReset()
    const details = {
      ...header,
      fulfillmentsCount: { count: 1, precision: "EXACT" },
      transactions: [],
      fulfillments: [{ id: "f1", status: "SUCCESS", location: { id: "loc" } }]
    }
    api.graphql
      .mockResolvedValueOnce({ shop: { myshopifyDomain: "test.myshopify.com" }, orders: { nodes: [header], pageInfo } })
      .mockResolvedValueOnce({
        order: { ...details, lineItems: { nodes: [line], pageInfo: { hasNextPage: true, endCursor: "line-next" } } }
      })
      .mockResolvedValueOnce({ order: { ...details, lineItems: { nodes: [{ ...line, id: "line2" }], pageInfo } } })
      .mockResolvedValueOnce({
        fulfillment: {
          id: "f1",
          fulfillmentLineItems: {
            nodes: [{ id: "fline1", quantity: 2, lineItem: { id: "line1" } }],
            pageInfo: { hasNextPage: true, endCursor: "fulfillment-next" }
          }
        }
      })
      .mockResolvedValueOnce({
        fulfillment: {
          id: "f1",
          fulfillmentLineItems: { nodes: [{ id: "fline2", quantity: 2, lineItem: { id: "line2" } }], pageInfo }
        }
      })
    const result = await collectShopifySales(api, "test.myshopify.com", window)
    expect(result[0]?.lines).toHaveLength(2)
    expect(result[0]?.fulfillments[0]?.lines).toHaveLength(2)
    expect(api.graphql.mock.calls[2]?.[1]?.after).toBe("line-next")
    expect(api.graphql.mock.calls[4]?.[1]?.after).toBe("fulfillment-next")
  })
  it("rejects a different store and interrupted ownership", async () => {
    await expect(collectShopifySales(shopify(), "other.myshopify.com", window)).rejects.toThrow("myshopifyDomain")
    const api = shopify()
    await expect(
      collectShopifySales(api, "test.myshopify.com", window, async () => {
        throw new Error("cancelled")
      })
    ).rejects.toThrow("cancelled")
    expect(api.graphql).not.toHaveBeenCalled()
  })
  it("rejects incomplete fulfillments and returns no partial data on downstream failure", async () => {
    const api = shopify()
    api.graphql
      .mockReset()
      .mockResolvedValueOnce({ shop: { myshopifyDomain: "test.myshopify.com" }, orders: { nodes: [header], pageInfo } })
      .mockResolvedValueOnce({
        order: {
          ...header,
          lineItems: { nodes: [line], pageInfo },
          fulfillmentsCount: { count: 251, precision: "EXACT" },
          transactions: [],
          fulfillments: []
        }
      })
    await expect(collectShopifySales(api, "test.myshopify.com", window)).rejects.toThrow("incomplete")
    const failed = shopify()
    failed.graphql
      .mockReset()
      .mockResolvedValueOnce({ shop: { myshopifyDomain: "test.myshopify.com" }, orders: { nodes: [header], pageInfo } })
      .mockRejectedValueOnce(new Error("provider unavailable"))
    await expect(collectShopifySales(failed, "test.myshopify.com", window)).rejects.toThrow("provider unavailable")
  })
  it("follows Amazon tokens preserving filters and separates the end boundary", async () => {
    const request = vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValueOnce({ orders: [amazonOrder], pagination: { nextToken: "a + token" } })
      .mockResolvedValueOnce({ orders: [{ ...amazonOrder, orderId: "o2", createdTime: window.to }] })
    expect(await collectAmazonSales({ request }, window)).toHaveLength(1)
    const url = new URL(String(request.mock.calls[1]?.[1]), "https://example.com")
    expect(url.searchParams.get("paginationToken")).toBe("a + token")
    expect(url.searchParams.get("includedData")).toBe("FULFILLMENT,PROCEEDS")
    expect(url.searchParams.get("createdAfter")).toBe(window.from)
  })
  it("reads orders from several marketplaces at once", async () => {
    const canada = { ...amazonOrder, salesChannel: { channelName: "Amazon.ca", marketplaceId: "A2EUQ1WTGCTBG2" } }
    const request = vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ orders: [canada] })
    expect(await collectAmazonSales({ request }, window, undefined, ["ATVPDKIKX0DER", "A2EUQ1WTGCTBG2"])).toEqual([
      canada
    ])
    const url = new URL(String(request.mock.calls[0]?.[1]), "https://example.com")
    expect(url.searchParams.get("marketplaceIds")).toBe("ATVPDKIKX0DER,A2EUQ1WTGCTBG2")
    // Only the US unless told otherwise.
    await expect(collectAmazonSales({ request }, window)).rejects.toThrow("marketplace")
  })
  it("keeps the order a replacement replaces", async () => {
    const replacement = {
      ...amazonOrder,
      associatedOrders: [{ orderId: "111-0000000-0000000", associationType: "REPLACEMENT_ORIGINAL_ID" }]
    }
    const request = vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ orders: [replacement] })
    expect((await collectAmazonSales({ request }, window))[0]?.associatedOrders).toEqual(replacement.associatedOrders)
  })
  it("rejects duplicate tokens, items and marketplaces", async () => {
    const request = vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({ orders: [], pagination: { nextToken: "loop" } })
    await expect(collectAmazonSales({ request }, window)).rejects.toThrow("Duplicate")
    request.mockResolvedValue({
      orders: [{ ...amazonOrder, orderItems: [amazonOrder.orderItems[0], amazonOrder.orderItems[0]] }]
    })
    await expect(collectAmazonSales({ request }, window)).rejects.toThrow("Duplicate")
    request.mockResolvedValue({
      orders: [{ ...amazonOrder, salesChannel: { channelName: "AMAZON", marketplaceId: "other" } }]
    })
    await expect(collectAmazonSales({ request }, window)).rejects.toThrow("marketplace")
  })
  it("rejects an invalid window before contacting a provider", async () => {
    const api = shopify()
    await expect(collectShopifySales(api, "test.myshopify.com", { from: window.to, to: window.from })).rejects.toThrow(
      "increasing sales window"
    )
    expect(api.graphql).not.toHaveBeenCalled()
  })
})

describe("Amazon transactions", () => {
  const money = (amount: number | string) => ({ currencyCode: "USD", currencyAmount: amount })
  const payment = {
    transactionId: "t1",
    transactionType: "Shipment",
    postedDate: "2026-08-10T03:00:00Z",
    totalAmount: money(16.5),
    relatedIdentifiers: [
      { relatedIdentifierName: "SHIPMENT_ID", relatedIdentifierValue: "s1" },
      { relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "111-1" }
    ],
    breakdowns: [
      {
        breakdownType: "Sales",
        breakdownAmount: money(25),
        breakdowns: [{ breakdownType: "ProductCharges", breakdownAmount: money(25) }]
      },
      {
        breakdownType: "Expenses",
        breakdownAmount: money(-8.5),
        breakdowns: [
          {
            breakdownType: "AmazonFees",
            breakdownAmount: money("-8.50"),
            breakdowns: [
              { breakdownType: "Commission", breakdownAmount: money(-3.75) },
              { breakdownType: "FBAPerUnitFulfillmentFee", breakdownAmount: money(-4.75) }
            ]
          }
        ]
      }
    ]
  }

  it("counts each fee category once, as a positive cost, and a refunded fee as negative", () => {
    expect(transactionFees(payment.breakdowns)).toBe(850)
    expect(transactionFees([{ breakdownType: "Commission", breakdownAmount: money(3.75) }])).toBe(-375)
    expect(transactionFees([{ breakdownType: "Tax", breakdownAmount: money(-2) }])).toBe(0)
    expect(transactionFees(undefined)).toBe(0)
    // Amazon sends null for a breakdown with no parts.
    expect(
      transactionFees([
        {
          breakdownType: "Expenses",
          breakdownAmount: null,
          breakdowns: [{ breakdownType: "AmazonFees", breakdownAmount: money(-2.5), breakdowns: null }]
        }
      ])
    ).toBe(250)
  })

  it("follows next tokens and links each transaction to its order", async () => {
    const request = vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValueOnce({ payload: { transactions: [payment], nextToken: "more" } })
      .mockResolvedValueOnce({
        payload: {
          transactions: [
            {
              transactionId: "t2",
              transactionType: "ServiceFee",
              postedDate: "2026-08-11T00:00:00Z",
              totalAmount: money(-39.99)
            }
          ]
        }
      })
    expect(await collectAmazonTransactions({ request }, window)).toEqual([
      expect.objectContaining({
        transactionId: "t1",
        orderId: "111-1",
        postedAt: "2026-08-10T03:00:00.000Z",
        type: "Shipment",
        currency: "USD",
        totalMinor: 1650,
        feesMinor: 850
      }),
      expect.objectContaining({ transactionId: "t2", orderId: null, totalMinor: -3999, feesMinor: 0 })
    ])
    const first = new URL(String(request.mock.calls[0]?.[1]), "https://example.com")
    expect(first.pathname).toBe("/finances/2024-06-19/transactions")
    expect(first.searchParams.get("postedAfter")).toBe(window.from)
    expect(first.searchParams.has("marketplaceId")).toBe(false)
    expect(new URL(String(request.mock.calls[1]?.[1]), "https://example.com").searchParams.get("nextToken")).toBe(
      "more"
    )
  })

  it("counts a deferred payment's fees once, not again when Amazon releases it", async () => {
    const deferred = {
      ...payment,
      transactionId: "deferred",
      relatedIdentifiers: [
        ...payment.relatedIdentifiers,
        { relatedIdentifierName: "RELEASE_TRANSACTION_ID", relatedIdentifierValue: "release" }
      ]
    }
    const release = {
      ...payment,
      transactionId: "release",
      relatedIdentifiers: [
        ...payment.relatedIdentifiers,
        { relatedIdentifierName: "DEFERRED_TRANSACTION_ID", relatedIdentifierValue: "deferred" }
      ]
    }
    const request = vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({ payload: { transactions: [deferred, release] } })
    expect(
      (await collectAmazonTransactions({ request }, window)).map((row) => [row.transactionId, row.feesMinor])
    ).toEqual([
      ["deferred", 850],
      ["release", 0]
    ])
  })

  it("refuses windows longer than Amazon allows and repeated tokens", async () => {
    const request = vi.fn<(...args: unknown[]) => Promise<unknown>>()
    await expect(
      collectAmazonTransactions({ request }, { from: "2026-01-01T00:00:00Z", to: "2026-09-01T00:00:00Z" })
    ).rejects.toThrow("180 days")
    request.mockResolvedValue({ payload: { transactions: [], nextToken: "loop" } })
    await expect(collectAmazonTransactions({ request }, window)).rejects.toThrow("Duplicate")
  })
})

describe("Shopify payment fees", () => {
  const money = (amount: string) => ({ amount, currencyCode: "USD" })
  it("adds Shopify Payments fees and their tax on successful payments", () => {
    expect(
      shopifyPaymentFees({
        transactions: [
          { id: "p1", kind: "SALE", status: "SUCCESS", fees: [{ amount: money("1.75"), taxAmount: money("0.10") }] },
          { id: "p2", kind: "SALE", status: "FAILURE", fees: [{ amount: money("9.99"), taxAmount: money("0") }] },
          { id: "p3", kind: "REFUND", status: "SUCCESS", fees: [] }
        ]
      })
    ).toEqual({ minor: 185, currency: "USD" })
    expect(shopifyPaymentFees({ transactions: [] })).toEqual({ minor: 0, currency: null })
    expect(shopifyPaymentFees({})).toBeNull()
  })

  it("asks Shopify for each order's payments and their fees", () => {
    expect(shopifySalesQueries.order).toContain(
      "transactions(first:100){id kind status fees{amount{amount currencyCode}"
    )
  })
})

describe("Shopify Payments balance transactions", () => {
  const usd = (amount: string) => ({ amount, currencyCode: "USD" })
  const node = (id: string, type: string, net: string, test = false) => ({
    id,
    type,
    test,
    transactionDate: "2026-08-10T12:00:00Z",
    amount: usd(net),
    fee: usd("0.00"),
    net: usd(net),
    associatedOrder: null,
    adjustmentReason: null
  })

  it("reads each page in the window, leaving out test transactions", async () => {
    const graphql = vi
      .fn<(_query: string, _variables?: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValueOnce({
        shopifyPaymentsAccount: {
          balanceTransactions: {
            nodes: [node("t1", "SHIPPING_LABEL", "-12.34"), node("t2", "CHARGE", "48.00", true)],
            pageInfo: { hasNextPage: true, endCursor: "next" }
          }
        }
      })
      .mockResolvedValueOnce({
        shopifyPaymentsAccount: {
          balanceTransactions: { nodes: [node("t3", "BILLING_DEBIT", "-89.99")], pageInfo }
        }
      })
    const rows = await collectShopifyBalanceTransactions({ graphql }, window)
    expect(rows.map((row) => [row.transactionId, row.type, row.netMinor])).toEqual([
      ["t1", "SHIPPING_LABEL", -1234],
      ["t3", "BILLING_DEBIT", -8999]
    ])
    expect(graphql.mock.calls[0]?.[1]).toEqual({
      query: `processed_at:>='${window.from}' processed_at:<'${window.to}'`,
      after: null
    })
    expect(graphql.mock.calls[1]?.[1]).toMatchObject({ after: "next" })
  })

  it("returns nothing for a store without Shopify Payments", async () => {
    const graphql = vi
      .fn<(_query: string, _variables?: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue({ shopifyPaymentsAccount: null })
    expect(await collectShopifyBalanceTransactions({ graphql }, window)).toEqual([])
  })
})

describe("backfill readers", () => {
  const range = { from: "2026-09-01T00:00:00.000Z", to: "2026-09-15T00:00:00.000Z" }

  it("reads Amazon's order report into the order search's shape, without shipping addresses", async () => {
    const columns = [
      "amazon-order-id",
      "purchase-date",
      "order-status",
      "fulfillment-channel",
      "sales-channel",
      "order-item-id",
      "sku",
      "asin",
      "item-status",
      "quantity",
      "currency",
      "item-price",
      "item-tax",
      "shipping-price",
      "item-promotion-discount",
      "ship-promotion-discount",
      "ship-city",
      "ship-postal-code"
    ]
    const row = (values: Record<string, string>) => columns.map((name) => values[name] ?? "").join("\t")
    const report = [
      columns.join("\t"),
      row({
        "amazon-order-id": "111-1",
        "purchase-date": "2026-09-02T10:00:00+00:00",
        "order-status": "Shipped",
        "fulfillment-channel": "Amazon",
        "sales-channel": "Amazon.com",
        "order-item-id": "i1",
        sku: "A",
        asin: "B01",
        "item-status": "Shipped",
        quantity: "2",
        currency: "USD",
        "item-price": "40.00",
        "item-tax": "3.20",
        "shipping-price": "5.00",
        "item-promotion-discount": "-4.00",
        "ship-promotion-discount": "-5.00",
        "ship-city": "Seattle",
        "ship-postal-code": "98101"
      }),
      // Pending: no price yet.
      row({
        "amazon-order-id": "702-2",
        "purchase-date": "2026-09-03T10:00:00+00:00",
        "order-status": "Pending",
        "fulfillment-channel": "Merchant",
        "sales-channel": "Amazon.ca",
        "order-item-id": "i2",
        sku: "B",
        "item-status": "Unshipped",
        quantity: "1",
        currency: "CAD"
      }),
      // Multi-channel fulfillment for another store, and an order outside the window: left out.
      row({
        "amazon-order-id": "S01-3",
        "purchase-date": "2026-09-03T10:00:00+00:00",
        "sales-channel": "Non-Amazon US"
      }),
      row({ "amazon-order-id": "111-4", "purchase-date": "2026-09-15T00:00:00+00:00", "sales-channel": "Amazon.com" })
    ].join("\n")
    const report$ = vi.fn<(...args: unknown[]) => Promise<string | null>>().mockResolvedValue(report)
    const orders = await collectAmazonSalesReport({ report: report$ as never }, range, [
      "ATVPDKIKX0DER",
      "A2EUQ1WTGCTBG2"
    ])
    expect(orders).toEqual([
      {
        orderId: "111-1",
        createdTime: "2026-09-02T10:00:00.000Z",
        salesChannel: { channelName: "AMAZON", marketplaceId: "ATVPDKIKX0DER" },
        fulfillment: { fulfillmentStatus: "SHIPPED", fulfilledBy: "AMAZON" },
        orderItems: [
          {
            orderItemId: "i1",
            quantityOrdered: 2,
            product: { sellerSku: "A", asin: "B01" },
            fulfillment: { quantityFulfilled: 2, quantityUnfulfilled: 0 },
            proceeds: {
              breakdowns: [
                { type: "ITEM", subtotal: { amount: "40", currencyCode: "USD" } },
                {
                  type: "DISCOUNT",
                  subtotal: { amount: "9", currencyCode: "USD" },
                  detailedBreakdowns: [
                    { subtype: "ITEM", value: { amount: "4", currencyCode: "USD" } },
                    { subtype: "SHIPPING", value: { amount: "5", currencyCode: "USD" } }
                  ]
                },
                { type: "SHIPPING", subtotal: { amount: "5", currencyCode: "USD" } },
                { type: "TAX", subtotal: { amount: "3.2", currencyCode: "USD" } }
              ]
            }
          }
        ]
      },
      {
        orderId: "702-2",
        createdTime: "2026-09-03T10:00:00.000Z",
        salesChannel: { channelName: "AMAZON", marketplaceId: "A2EUQ1WTGCTBG2" },
        fulfillment: { fulfillmentStatus: "PENDING", fulfilledBy: "MERCHANT" },
        orderItems: [
          {
            orderItemId: "i2",
            quantityOrdered: 1,
            product: { sellerSku: "B", asin: undefined },
            fulfillment: { quantityFulfilled: 0, quantityUnfulfilled: 1 }
          }
        ]
      }
    ])
    expect(JSON.stringify(orders)).not.toMatch(/Seattle|98101/)
    expect(report$.mock.calls[0]?.[0]).toMatchObject({
      reportType: "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL",
      dataStartTime: range.from,
      dataEndTime: range.to
    })
    report$.mockResolvedValue(null)
    expect(await collectAmazonSalesReport({ report: report$ as never }, range, ["ATVPDKIKX0DER"])).toBeNull()
  })

  it("reads Shopify's bulk export, then what each fulfillment shipped", async () => {
    const order = {
      ...header,
      id: "gid://shopify/Order/1",
      customer: { id: "gid://shopify/Customer/9" },
      fulfillments: [{ id: "f1", status: "SUCCESS", location: { id: "loc1" } }],
      transactions: []
    }
    const exported = [
      order,
      { ...line, __parentId: order.id },
      {
        ...header,
        id: "gid://shopify/Order/2",
        cancelledAt: "2026-09-02T00:00:00Z",
        fulfillments: [],
        transactions: []
      }
    ]
      .map((row) => JSON.stringify(row))
      .join("\n")
    const graphql = vi
      .fn<(query: string, variables?: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValueOnce({ bulkOperationRunQuery: { bulkOperation: { id: "bulk1" }, userErrors: [] } })
      .mockResolvedValueOnce({ bulkOperation: { status: "RUNNING" } })
      .mockResolvedValueOnce({ bulkOperation: { status: "COMPLETED", url: "https://storage.example/orders.jsonl" } })
      .mockResolvedValueOnce({
        fulfillment: {
          id: "f1",
          fulfillmentLineItems: { nodes: [{ id: "fl1", quantity: 2, lineItem: { id: "line1" } }], pageInfo }
        }
      })
    const download = vi.fn<typeof fetch>(async () => new Response(exported))
    const orders = await collectShopifySalesBulk({ graphql }, window, undefined, {
      customers: true,
      download,
      sleep: async () => undefined
    })
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({
      id: "gid://shopify/Order/1",
      tags: ["Wholesale"],
      customerId: "gid://shopify/Customer/9",
      lines: [line],
      fulfillments: [{ id: "f1", lines: [{ id: "fl1", quantity: 2, lineItem: { id: "line1" } }] }]
    })
    expect(String(graphql.mock.calls[0]?.[1]?.query)).toContain("customer{id}")
    expect(download).toHaveBeenCalledWith("https://storage.example/orders.jsonl", expect.anything())
  })

  it("fails when Shopify won't start the export or it fails", async () => {
    const refused = vi
      .fn<(query: string) => Promise<unknown>>()
      .mockResolvedValue({ bulkOperationRunQuery: { bulkOperation: null, userErrors: [{ message: "Busy" }] } })
    await expect(collectShopifySalesBulk({ graphql: refused }, window)).rejects.toThrow("Busy")
    const failed = vi
      .fn<(query: string) => Promise<unknown>>()
      .mockResolvedValueOnce({ bulkOperationRunQuery: { bulkOperation: { id: "bulk1" }, userErrors: [] } })
      .mockResolvedValueOnce({ bulkOperation: { status: "FAILED", errorCode: "TIMEOUT" } })
    await expect(collectShopifySalesBulk({ graphql: failed }, window)).rejects.toThrow("TIMEOUT")
  })
})
