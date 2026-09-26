import { describe, expect, it, vi } from "vitest"
import { collectShopifySales, collectAmazonSales, shopifySalesQueries } from "../src/sales"
const window = { from: "2026-08-01T00:00:00Z", to: "2026-09-01T00:00:00Z" }
const pageInfo = { hasNextPage: false, endCursor: null }
const header = {
  id: "order1",
  name: "#1001",
  createdAt: "2026-08-20T00:00:00Z",
  cancelledAt: null,
  test: false,
  sourceName: "web"
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
        fulfillments: [{ id: "fulfillment1", status: "SUCCESS", location: { id: "location1" } }]
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
    expect(api.graphql).toHaveBeenCalledWith(shopifySalesQueries.orders, {
      query: `created_at:>='${window.from}' created_at:<'${window.to}'`,
      after: null
    })
    expect(active).toHaveBeenCalledTimes(6)
    expect(Object.values(shopifySalesQueries).join(" ")).not.toMatch(/email|address|customer/i)
  })
  it("follows nested line and fulfillment line pagination", async () => {
    const api = shopify()
    api.graphql.mockReset()
    const details = {
      ...header,
      fulfillmentsCount: { count: 1, precision: "EXACT" },
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
    expect(url.searchParams.get("includedData")).toBe("FULFILLMENT")
    expect(url.searchParams.get("createdAfter")).toBe(window.from)
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
