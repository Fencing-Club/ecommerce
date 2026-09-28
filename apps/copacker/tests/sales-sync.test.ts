import { ProviderError } from "@repo/aisle/amazon"
import type { ShopifySale } from "@repo/aisle/sales"
import { describe, expect, it, vi } from "vitest"
import { orderSales, salesDataVersion, summarizeSalesOrder, syncChunks, throttled } from "../src/server/sales-orders"
import { ledgerChunks } from "../src/server/stock-days"

const day = 86400000

describe("order and stock history syncs", () => {
  it("waits and retries a throttled read, but not other failures", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
    const owned = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ProviderError(429, null, "throttled", 90000))
      .mockRejectedValueOnce(new ProviderError(503, null, "busy"))
      .mockResolvedValueOnce("orders")
    expect(await throttled(read, owned, sleep)).toBe("orders")
    expect(sleep.mock.calls).toEqual([[90000], [120000]])
    expect(owned).toHaveBeenCalledTimes(2)
    await expect(
      throttled(async () => Promise.reject(new ProviderError(403, null, "denied")), owned, sleep)
    ).rejects.toThrow("denied")
    const always = vi.fn<() => Promise<string>>().mockRejectedValue(new ProviderError(429, null, "throttled"))
    await expect(throttled(always, owned, sleep)).rejects.toThrow("throttled")
    expect(always).toHaveBeenCalledTimes(5)
  })
  it("reads orders stored in an older shape again, newest first", () => {
    const now = Date.parse("2026-09-25T12:00:00Z")
    const coverage = { coveredFrom: new Date(now - 365 * day), coveredTo: new Date(now - day) }
    expect(syncChunks(now, { ...coverage, dataVersion: 0 }).fresh).toBe(true)
    expect(syncChunks(now, { ...coverage, dataVersion: salesDataVersion }).fresh).toBe(false)
  })
  it("starts over from the newest orders when the stored range stopped over a month ago", () => {
    const now = Date.parse("2026-09-25T12:00:00Z")
    const stale = syncChunks(now, { coveredFrom: new Date(now - 365 * day), coveredTo: new Date(now - 300 * day) })
    expect(stale.fresh).toBe(true)
    expect(stale.chunks[0]!.to.getTime()).toBe(Date.parse("2026-09-25T11:57:00Z"))
  })
  it("reads the ledger in 30-day periods: a year newest first, later the last week and any older gap", () => {
    const now = Date.parse("2026-09-25T12:00:00Z")
    const today = Date.parse("2026-09-25T00:00:00Z")
    const first = ledgerChunks(now, { from: null, to: null })
    expect(first.fresh).toBe(true)
    expect(first.chunks[0]).toEqual({ from: new Date(today - 30 * day), to: new Date(today) })
    expect(first.chunks.at(-1)!.from.getTime()).toBe(today - 365 * day)
    const later = ledgerChunks(now, { from: new Date(today - 365 * day), to: new Date(today - day) })
    expect(later).toEqual({ fresh: false, chunks: [{ from: new Date(today - 8 * day), to: new Date(today) }] })
    expect(ledgerChunks(now, { from: new Date(0), to: new Date(today - 60 * day) }).fresh).toBe(true)
  })

  it("counts an order's sales as the Overview does", () => {
    const money = (amount: string) => ({ shopMoney: { amount, currencyCode: "USD" } })
    const line = { id: "l1", quantity: 3, currentQuantity: 2, sku: "A", variant: { id: "va" } }
    const shopify = {
      id: "o1",
      name: "#1",
      createdAt: "2026-09-24T10:00:00Z",
      cancelledAt: null,
      test: false,
      sourceName: "web",
      fulfillments: [],
      lines: [
        { ...line, originalUnitPriceSet: money("10.00"), discountAllocations: [{ allocatedAmountSet: money("3.00") }] },
        { ...line, id: "l2", quantity: 2, currentQuantity: 2, originalUnitPriceSet: money("5.00") }
      ]
    }
    // $20 less 2/3 of $3, plus $10.
    expect(orderSales(shopify)).toEqual({ minor: 2800, currency: "USD" })
    expect(orderSales({ ...shopify, lines: [line] })).toBeNull()
    const item = (breakdowns?: { type: string; subtotal: { amount: string; currencyCode: string } }[]) => ({
      orderItemId: "i1",
      quantityOrdered: 3,
      product: { sellerSku: "A" },
      ...(breakdowns && { proceeds: { breakdowns } })
    })
    const usd = (amount: string) => ({ amount, currencyCode: "USD" })
    const amazon = {
      orderId: "111-1",
      createdTime: "2026-09-23T05:00:00Z",
      salesChannel: { channelName: "Amazon.com", marketplaceId: "ATVPDKIKX0DER" },
      orderItems: [
        item([
          { type: "ITEM", subtotal: usd("30.00") },
          { type: "DISCOUNT", subtotal: usd("-3.00") },
          { type: "TAX", subtotal: usd("2.40") }
        ])
      ]
    }
    expect(orderSales(amazon)).toEqual({ minor: 2700, currency: "USD" })
    expect(orderSales({ ...amazon, orderItems: [item()] })).toBeNull()
  })

  it("lists an order Shopify cancelled as Cancelled, whatever shipped", () => {
    const order: ShopifySale = {
      id: "gid://shopify/Order/1",
      name: "#1001",
      createdAt: "2026-09-24T10:00:00Z",
      cancelledAt: null,
      test: false,
      sourceName: "web",
      lines: [{ id: "l1", quantity: 1, currentQuantity: 1, sku: "A", variant: { id: "va" } }],
      fulfillments: []
    }
    const shipped = {
      id: "f1",
      status: "SUCCESS",
      location: null,
      lines: [{ id: "fl1", quantity: 1, lineItem: { id: "l1" } }]
    }
    const status = (data: ShopifySale) =>
      summarizeSalesOrder("shopify", new Date(data.createdAt), data, "test.myshopify.com").status
    expect(status(order)).toBe("Unfulfilled")
    expect(status({ ...order, fulfillments: [shipped] })).toBe("Fulfilled")
    expect(status({ ...order, cancelledAt: "2026-09-25T08:00:00Z" })).toBe("Cancelled")
    expect(status({ ...order, cancelledAt: "2026-09-25T08:00:00Z", fulfillments: [shipped] })).toBe("Cancelled")
  })
})
