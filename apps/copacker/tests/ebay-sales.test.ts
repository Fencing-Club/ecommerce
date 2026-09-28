import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { EbaySale } from "@repo/aisle/sales"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.current }))
// The seller's orders as eBay's Fulfillment API lists them.
const ebay = vi.hoisted(() => ({
  orders: [] as unknown[],
  request: vi.fn<(method: string, path: string) => Promise<unknown>>()
}))
vi.mock("../src/server/connections", async (original) => ({
  ...(await original<typeof import("../src/server/connections")>()),
  ebayFor: async () => ({ request: ebay.request })
}))
import { orderFees, salesByDay, salesByItem } from "../src/server/overview-sales"
import { runNextJob } from "../src/server/queue"
import { ebayLocation } from "../src/server/restock-page"
import { restockPlan } from "../src/server/restock-plan"
import { attributeEbaySales } from "../src/server/sales-attribution"
import {
  listSalesOrders,
  orderSales,
  requestSalesSync,
  restockDemand,
  salesSyncStatus,
  storedDemand,
  summarizeSalesOrder
} from "../src/server/sales-orders"
import { encrypt } from "../src/server/security"
import { applyMigrations } from "./migrations"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const orgId = randomUUID()
const seller = "vWvOsUq8KJk"
const day = 86400000
const daysAgo = (days: number) => new Date(Date.now() - days * day).toISOString()

function sale(orderId: string, creationDate: string, lines: Partial<EbaySale["lineItems"][number]>[] = [{}]): EbaySale {
  return {
    orderId,
    creationDate,
    orderFulfillmentStatus: "FULFILLED",
    salesRecordReference: `SR-${orderId}`,
    totalMarketplaceFee: { value: "3.25", currency: "USD" },
    lineItems: lines.map((line, index) => ({
      lineItemId: `${orderId}-${index}`,
      sku: "MASK-M",
      title: "Fencing mask, M",
      quantity: 1,
      lineItemCost: { value: "25.00", currency: "USD" },
      ...line
    }))
  }
}

beforeAll(async () => {
  context.current = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  vi.resetAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  await pg.exec("TRUNCATE organizations, jobs CASCADE")
  await database.insert(tables.organizations).values({ id: orgId, name: "Fencing Club", kind: "buyer" })
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"))
  await database.insert(tables.connections).values({
    orgId,
    provider: "ebay",
    externalId: seller,
    encryptedToken: encrypt(JSON.stringify({ token: "refresh" }), `${orgId}:ebay`)
  })
  // Answers each period's read with the orders placed in it, as eBay's creation date filter does.
  ebay.request.mockImplementation(async (_method, path) => {
    const filter = new URL(path, "https://api.ebay.com").searchParams.get("filter") ?? ""
    const [, from, to] = /creationdate:\[(.+)\.\.(.+)\]/.exec(filter) ?? []
    const orders = ebay.orders.filter((order) => {
      const at = Date.parse((order as EbaySale).creationDate)
      return at >= Date.parse(from!) && at <= Date.parse(to!)
    })
    return { orders, total: orders.length }
  })
})

async function syncEbay() {
  expect(await requestSalesSync({ id: orgId, kind: "buyer" }, "ebay")).toEqual({ status: "queued" })
  while (await runNextJob()) {
    // Runs the sync and anything it queues.
  }
}

describe("eBay order sync", () => {
  it("copies two years of orders, then lists, counts and searches them with the other sources", async () => {
    ebay.orders = [
      sale("12-00001-00001", daysAgo(3), [
        {},
        { sku: "GLOVE-L", title: "Glove", quantity: 2, lineItemCost: { value: "30.00", currency: "USD" } }
      ]),
      {
        ...sale("12-00002-00002", daysAgo(40), [
          { appliedPromotions: [{ discountAmount: { value: "5.00", currency: "USD" } }] }
        ]),
        orderFulfillmentStatus: "NOT_STARTED"
      },
      sale("12-00003-00003", daysAgo(700))
    ]
    await syncEbay()
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ source: "ebay", externalAccountId: seller, status: "idle", errorCode: null })
    expect(sync!.coveredTo!.getTime()).toBeGreaterThan(Date.now() - day)
    expect(sync!.coveredFrom!.getTime()).toBeLessThan(Date.now() - 720 * day)
    // One read per two-week period, each for its own creation dates.
    expect(ebay.request.mock.calls.length).toBeGreaterThan(50)
    expect(ebay.request.mock.calls[0]![1]).toMatch(/^\/sell\/fulfillment\/v1\/order\?filter=creationdate/)

    const list = await listSalesOrders(orgId, { page: 0 })
    expect(list.total).toBe(3)
    expect(list.orders[0]).toEqual({
      source: "ebay",
      orderId: "12-00001-00001",
      number: "SR-12-00001-00001",
      orderedAt: expect.any(String),
      units: 3,
      items: [
        { sku: "MASK-M", name: "Fencing mask, M", quantity: 1 },
        { sku: "GLOVE-L", name: "Glove", quantity: 2 }
      ],
      channel: "eBay",
      status: "Fulfilled",
      sales: { minor: 5500, currency: "USD" },
      fees: { minor: 325, currency: "USD" },
      url: "https://www.ebay.com/sh/ord/details?orderid=12-00001-00001"
    })
    expect(list.orders[1]).toMatchObject({ status: "Unfulfilled", sales: { minor: 2000, currency: "USD" } })
    expect((await listSalesOrders(orgId, { page: 0, source: "ebay", q: "glove" })).total).toBe(1)
    expect((await listSalesOrders(orgId, { page: 0, source: "shopify" })).total).toBe(0)

    const [status] = await salesSyncStatus(orgId)
    expect(status).toMatchObject({ source: "ebay", orders: 3, recent: { orders: 1, units: 3 } })

    const demand = await storedDemand(orgId, "ebay", 56)
    expect(demand.rows).toEqual([
      expect.objectContaining({ buyerSku: "MASK-M", pool: "ebay", fulfilledUnits: 2 }),
      expect.objectContaining({ buyerSku: "GLOVE-L", pool: "ebay", fulfilledUnits: 2 })
    ])
    expect(demand.saleDays.get("GLOVE-L")?.size).toBe(1)
    expect((await restockDemand(orgId, ["ebay"], 56)).ebaySales?.rows).toHaveLength(2)
  })

  it("drops an order eBay cancelled from the period it's read again in", async () => {
    ebay.orders = [sale("12-1", daysAgo(2)), sale("12-2", daysAgo(2))]
    await syncEbay()
    expect((await listSalesOrders(orgId, { page: 0 })).total).toBe(2)
    ebay.orders = [sale("12-1", daysAgo(2)), { ...sale("12-2", daysAgo(2)), cancelStatus: { cancelState: "CANCELED" } }]
    await syncEbay()
    expect((await listSalesOrders(orgId, { page: 0 })).orders.map((order) => order.orderId)).toEqual(["12-1"])
  })

  it("records a failed sync and keeps the orders already copied", async () => {
    ebay.orders = [sale("12-1", daysAgo(2))]
    await syncEbay()
    ebay.request.mockRejectedValue(new Error("eBay request failed (500)"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await syncEbay()
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ status: "failed" })
    expect((await listSalesOrders(orgId, { page: 0 })).total).toBe(1)
  })
})

describe("eBay orders beside Shopify's copies of them", () => {
  // Shopify's eBay sales channel copies each eBay order into Shopify, tagged eBay. With eBay connected, those copies
  // are left out by excluding the tag in Settings, so each sale counts once.
  it("counts each eBay sale once when Shopify's tagged copies are excluded", async () => {
    await database
      .insert(tables.connections)
      .values({ orgId, provider: "shopify", externalId: "club.myshopify.com", encryptedToken: "x" })
    const at = daysAgo(2)
    const shopifyCopy = (id: string, tags: string[], sourceName: string) => ({
      orgId,
      source: "shopify" as const,
      externalAccountId: "club.myshopify.com",
      orderId: id,
      orderedAt: new Date(at),
      data: {
        id,
        name: `#${id}`,
        createdAt: at,
        cancelledAt: null,
        test: false,
        sourceName,
        tags,
        lines: [
          {
            id: `${id}-l`,
            quantity: 1,
            currentQuantity: 1,
            sku: "MASK-M",
            variant: { id: "gid://shopify/ProductVariant/1" },
            originalUnitPriceSet: { shopMoney: { amount: "25.00", currencyCode: "USD" } }
          }
        ],
        fulfillments: []
      }
    })
    await database
      .insert(tables.salesOrders)
      .values([shopifyCopy("1001", ["eBay", "eBay-US"], "ebay"), shopifyCopy("1002", [], "web")])
    ebay.orders = [sale("12-1", at)]
    await syncEbay()
    await database.insert(tables.salesSyncs).values({
      orgId,
      source: "shopify",
      externalAccountId: "club.myshopify.com",
      coveredFrom: new Date(Date.now() - 60 * day),
      coveredTo: new Date()
    })
    const sources = async () =>
      Object.fromEntries((await salesSyncStatus(orgId)).map((state) => [state.source, state.recent.orders]))
    // Before the tag is excluded, the eBay sale shows twice: once from eBay and once as Shopify's copy.
    expect(await sources()).toEqual({ shopify: 2, ebay: 1 })
    expect((await listSalesOrders(orgId, { page: 0 })).total).toBe(3)

    await pg.exec(`UPDATE organizations SET "excludedShopifyTags" = '{Amazon,ebay}'`)
    expect(await sources()).toEqual({ shopify: 1, ebay: 1 })
    const listed = await listSalesOrders(orgId, { page: 0 })
    expect(listed.orders.map((order) => `${order.source}:${order.orderId}`).toSorted()).toEqual([
      "ebay:12-1",
      "shopify:1002"
    ])
    // Shopify's catalog doesn't name the eBay line, so it keeps its listing's title.
    expect(listed.orders.find((order) => order.source === "ebay")?.items[0]?.name).toBe("Fencing mask, M")
    const accounts = [
      { provider: "shopify" as const, externalId: "club.myshopify.com", excludedTags: ["ebay"] },
      { provider: "ebay" as const, externalId: seller }
    ]
    const days = await salesByDay(orgId, accounts, new Date(Date.now() - 10 * day), "UTC", "USD")
    expect(days.map((row) => [row.source, row.orders, row.units, row.revenueMinor]).toSorted()).toEqual([
      ["ebay", 1, 1, 2500],
      ["shopify", 1, 1, 2500]
    ])
  })
})

describe("eBay sales figures", () => {
  it("sums eBay lines less promotions, and the fees eBay reports", async () => {
    const order = sale("12-1", daysAgo(1), [
      {
        quantity: 2,
        lineItemCost: { value: "40.00", currency: "USD" },
        appliedPromotions: [{ discountAmount: { value: "-4.00", currency: "USD" } }]
      }
    ])
    expect(orderSales(order)).toEqual({ minor: 3600, currency: "USD" })
    expect(summarizeSalesOrder("ebay", new Date(order.creationDate), order, seller)).toMatchObject({
      units: 2,
      sales: { minor: 3600, currency: "USD" },
      fees: { minor: 325, currency: "USD" }
    })
    expect(
      summarizeSalesOrder(
        "ebay",
        new Date(order.creationDate),
        { ...order, orderFulfillmentStatus: "IN_PROGRESS" },
        seller
      ).status
    ).toBe("Partially fulfilled")
    expect(() => summarizeSalesOrder("amazon", new Date(order.creationDate), order, seller)).toThrow("doesn't match")
  })

  it("counts eBay items by SKU and each order's fees in the Overview", async () => {
    await database.insert(tables.salesOrders).values(
      [
        sale("12-1", daysAgo(1), [
          { quantity: 3, lineItemCost: { value: "60.00", currency: "USD" } },
          { sku: " ", quantity: 1 }
        ])
      ].map((data) => ({
        orgId,
        source: "ebay" as const,
        externalAccountId: seller,
        orderId: data.orderId,
        orderedAt: new Date(data.creationDate),
        data
      }))
    )
    const account = { provider: "ebay" as const, externalId: seller }
    const bounds = { from: new Date(Date.now() - 7 * day), to: new Date(Date.now() + day) }
    const items = await salesByItem(orgId, [account], { current: bounds, previous: null }, "USD")
    expect(items).toEqual([
      {
        source: "ebay",
        key: "MASK-M",
        period: "current",
        units: 3,
        revenueMinor: 6000,
        pricedUnits: 3,
        currency: "USD"
      }
    ])
    expect(await orderFees(orgId, account, bounds.from, bounds.to, "USD")).toEqual([
      { orderId: "12-1", revenueMinor: 8500, feesMinor: 325 }
    ])
  })

  // As Shopify's refunded units are gone from its orders, so are eBay's.
  it("leaves out what was refunded, in the order list and the Overview", async () => {
    const refunded = {
      ...sale("12-2", daysAgo(1), [{ quantity: 2, lineItemCost: { value: "50.00", currency: "USD" } }]),
      orderPaymentStatus: "FULLY_REFUNDED"
    }
    const partly = sale("12-3", daysAgo(1), [
      { quantity: 1, refunds: [{ amount: { value: "5.00", currency: "USD" } }] },
      {
        lineItemId: "x",
        sku: "GLOVE-L",
        quantity: 2,
        lineItemCost: { value: "30.00", currency: "USD" },
        refunds: [{ amount: { value: "30.00", currency: "USD" } }]
      }
    ])
    expect(summarizeSalesOrder("ebay", new Date(refunded.creationDate), refunded, seller)).toMatchObject({
      units: 0,
      items: [],
      sales: { minor: 0, currency: "USD" }
    })
    expect(summarizeSalesOrder("ebay", new Date(partly.creationDate), partly, seller)).toMatchObject({
      units: 1,
      items: [{ sku: "MASK-M", quantity: 1 }],
      sales: { minor: 2000, currency: "USD" }
    })
    await database.insert(tables.salesOrders).values(
      [refunded, partly].map((data) => ({
        orgId,
        source: "ebay" as const,
        externalAccountId: seller,
        orderId: data.orderId,
        orderedAt: new Date(data.creationDate),
        data
      }))
    )
    const account = { provider: "ebay" as const, externalId: seller }
    const days = await salesByDay(orgId, [account], new Date(Date.now() - 7 * day), "UTC", "USD")
    expect(days.reduce((sum, row) => sum + row.units, 0)).toBe(1)
    expect(days.reduce((sum, row) => sum + row.revenueMinor, 0)).toBe(2000)
    const bounds = { from: new Date(Date.now() - 7 * day), to: new Date(Date.now() + day) }
    const items = await salesByItem(orgId, [account], { current: bounds, previous: null }, "USD")
    expect(items.map((item) => [item.key, item.units, item.revenueMinor]).toSorted()).toEqual([
      ["GLOVE-L", 0, 0],
      ["MASK-M", 1, 2000]
    ])
  })
})

describe("eBay demand in restock", () => {
  const location = (id: number) => `gid://shopify/Location/${id}`
  const shipped = (locationId: string, fulfilledUnits: number) => ({
    variantId: "v",
    buyerSku: "SKU",
    locationId,
    pool: "shopify" as const,
    bundleVariantId: null,
    fulfilledUnits
  })

  it("counts every unit ordered by SKU, and reports lines without one", () => {
    const demand = attributeEbaySales([sale("1", daysAgo(1), [{ quantity: 2 }, { sku: undefined, quantity: 1 }])])
    expect(demand.rows).toEqual([expect.objectContaining({ buyerSku: "MASK-M", pool: "ebay", fulfilledUnits: 2 })])
    expect(demand.gaps).toEqual([expect.objectContaining({ reason: "product_unmapped", units: 1, buyerSku: null })])
  })

  it("places eBay orders at the location that ships most of the store's own orders", () => {
    expect(
      ebayLocation(
        [shipped(location(1), 5), shipped(location(2), 40), shipped(location(1), 10)],
        [location(1), location(2)]
      )
    ).toBe(location(2))
    // A location that isn't counted (such as Amazon's mirror) never takes eBay's orders.
    expect(ebayLocation([shipped(location(9), 100)], [location(1)])).toBe(location(1))
    expect(ebayLocation([], [location(1), location(2)])).toBeNull()
  })

  const catalog: Parameters<typeof restockPlan>[0]["catalog"] = [
    {
      variantId: "v1",
      inventoryItemId: "i1",
      buyerSku: "MASK-M",
      productId: "p1",
      productTitle: "Mask",
      variantTitle: "M",
      tracked: true,
      unit: "shopify_inventory_unit",
      levels: [
        { locationId: location(1), locationName: "Warehouse", available: 5, onHand: 5, committed: 0, incoming: 0 },
        { locationId: location(2), locationName: "Store", available: 5, onHand: 5, committed: 0, incoming: 0 }
      ]
    }
  ]
  const plan = (
    locationId: string,
    ebayRows = [
      { ...shipped(location(1), 4), variantId: null, buyerSku: "MASK-M", pool: "ebay" as const, locationId: null }
    ]
  ) =>
    restockPlan({
      channel: { kind: "shopify", locationId },
      catalog,
      classifications: new Map([
        [location(1), "merchant"],
        [location(2), "merchant"]
      ] as const),
      onOrder: new Map(),
      shopifySales: { rows: [{ ...shipped(location(1), 6), variantId: "v1", buyerSku: "MASK-M" }], gaps: [] },
      amazonSales: null,
      ebaySales: { rows: ebayRows, gaps: [] },
      ebayLocationId: location(1),
      fbaRows: null,
      awdRows: null,
      salesDays: 28,
      leadTimeDays: 28,
      productDefaults: new Map(),
      supplierFor: () => null
    })[0]!

  it("adds eBay's units to the sales of the location they ship from, and nowhere else", () => {
    expect(plan(location(1))).toMatchObject({ sold: 10, soldOnEbay: 4 })
    expect(plan(location(2))).toMatchObject({ sold: 0, soldOnEbay: null })
  })
})
