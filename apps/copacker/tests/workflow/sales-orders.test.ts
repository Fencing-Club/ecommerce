import { ProviderError } from "@repo/copacker-marketplaces/amazon"
import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { startFirstSync } from "../../src/server/first-sync"
import { POST as postAction } from "../../src/server/http/api/action"
import { POST as demandRoute } from "../../src/server/http/api/inventory/demand"
import { runNextJob } from "../../src/server/queue"
import { readSalesDemand } from "../../src/server/sales"
import {
  listSalesOrders,
  orderSyncProgress,
  requestSalesSync,
  salesSyncStatus,
  storedDemand,
  syncChunks
} from "../../src/server/sales-orders"
import { shopifyOrderTags } from "../../src/server/shopify-tags"
import { recordStockDays, stockoutDays } from "../../src/server/stock-days"
import { drainSales } from "../drain-sales"
import { inventoryMovementReport } from "../fixtures/amazon-inventory-movements"
import { reimbursementReport } from "../fixtures/amazon-reimbursements"
import { removalReport } from "../fixtures/amazon-removals"
import { agedStorageReport, monthlyStorageReport } from "../fixtures/amazon-storage-fees"
import { provider } from "../mocks/providers"
import { served } from "../served"
import { database } from "../test-db"
import { signedIn } from "../test-session"
import {
  buyer,
  buyerId,
  orderConnections,
  orderConnectionsAmazonOnly,
  otherId,
  setUpWorkflowTests,
  supplier
} from "./fixtures"

// The action route as Start serves it, through the HTTP boundary that answers its failures.
const action = served(postAction)

vi.mock("../../src/server/connections", async () => (await import("../mocks/providers")).connectionsModule())
vi.mock("../../src/server/product-fields", async (original) =>
  (await import("../mocks/providers")).productFieldsModule(original)
)
vi.mock("../../src/server/storage", async (original) => (await import("../mocks/providers")).storageModule(original))
vi.mock("@repo/copacker-shipments/documents", async (original) =>
  (await import("../mocks/providers")).documentsModule(original)
)
vi.mock("@repo/copacker-shipments/product-labels", async (original) =>
  (await import("../mocks/providers")).productLabelsModule(original)
)
vi.mock("../../src/server/auth", async (original) => (await import("../test-session")).mockAuth(original))
vi.mock("@/db", () => import("../test-db"))
vi.mock("../../src/server/import-trace", async (original) =>
  (await import("../mocks/providers")).importTraceModule(original)
)
vi.mock("../../src/server/readiness", async (original) =>
  (await import("../mocks/providers")).readinessModule(original)
)

setUpWorkflowTests()
const readDemand = served(demandRoute)

describe("tenant sales demand reads", () => {
  const window = () => ({
    from: new Date(Date.now() - 56 * 86400000).toISOString(),
    to: new Date(Date.now() - 300000).toISOString()
  })
  beforeEach(async () => {
    await orderConnections()
    await database.update(tables.connections).set({ scopes: "read_orders,read_locations" })
    provider.connection.mockImplementation(async (orgId: string, kind: string) => {
      const rows = await database.select().from(tables.connections)
      const row = rows.find((row) => row.orgId === orgId && row.provider === kind)
      if (!row) {
        throw new Error("not connected")
      }
      return row
    })
    provider.shopifyFor.mockResolvedValue(provider.api)
    provider.api.graphql.mockResolvedValue({
      shop: { myshopifyDomain: "test.myshopify.com" },
      orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
    })
    provider.api.request.mockResolvedValue({ orders: [] })
  })
  it("returns a complete empty result only for the current account and explicit window", async () => {
    const range = window()
    expect(await readSalesDemand(buyer, { source: "shopify", window: range })).toMatchObject({
      source: "shopify",
      externalAccountId: "test.myshopify.com",
      window: range,
      collectionComplete: true,
      attributionComplete: true,
      rows: [],
      gaps: []
    })
    expect(provider.shopifyFor).toHaveBeenCalledWith(buyerId, "test.myshopify.com")
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    expect(await database.select().from(tables.orders)).toHaveLength(1)
  })
  it("blocks unsupported history and missing grants before reading any sales", async () => {
    await expect(
      readSalesDemand(buyer, {
        source: "shopify",
        window: { ...window(), from: new Date(Date.now() - 61 * 86400000).toISOString() }
      })
    ).rejects.toThrow("60 days")
    await database.update(tables.connections).set({ scopes: "read_inventory" })
    await expect(readSalesDemand(buyer, { source: "shopify", window: window() })).rejects.toThrow("order history")
    expect(provider.api.graphql).not.toHaveBeenCalled()
  })
  it("rejects Amazon history outside retention instead of reporting zero sales", async () => {
    await expect(
      readSalesDemand(buyer, { source: "amazon", window: { from: "2020-01-01T00:00:00Z", to: "2020-01-02T00:00:00Z" } })
    ).rejects.toThrow("last 2 years")
    expect(provider.api.request).not.toHaveBeenCalled()
  })
  it("does not publish results if the seller changes during the provider read", async () => {
    provider.api.request.mockImplementationOnce(async () => {
      await database
        .update(tables.connections)
        .set({ externalId: "replaced" })
        .where(eq(tables.connections.provider, "amazon"))
      return { orders: [] }
    })
    await expect(readSalesDemand(buyer, { source: "amazon", window: window() })).rejects.toThrow("account changed")
    expect(provider.amazonFor).toHaveBeenCalledWith(buyerId, "A123456789")
  })
  // Its origin check is the HTTP boundary's, in http-response.test.ts.
  it("rejects tenant overrides and suppliers", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000")
    const request = (body: unknown) =>
      new Request("http://localhost:3000/api/inventory/demand", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    const body = { source: "amazon", window: window() }
    expect((await readDemand(request({ ...body, orgId: otherId }))).status).toBe(400)
    signedIn.actor = supplier
    expect((await readDemand(request(body))).status).toBe(403)
    expect(provider.api.request).not.toHaveBeenCalled()
  })
  it("returns safe errors and private caching rather than provider diagnostics", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000")
    const request = () =>
      new Request("http://localhost:3000/api/inventory/demand", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ source: "amazon", window: window() })
      })
    provider.api.request.mockRejectedValueOnce(new Error("private provider text"))
    const failed = await readDemand(request())
    expect(failed.status).toBe(503)
    expect(await failed.text()).not.toContain("private provider text")
    expect(failed.headers.get("cache-control")).toBe("private, no-store")
    expect((await readDemand(request())).status).toBe(200)
  })
})

describe("stored sales orders", () => {
  // On a whole minute, so a timestamp ends in "00.000Z" and a search such as "10.00" never matches the clock.
  const daysAgo = (days: number) => new Date(Math.floor(Date.now() / 60000) * 60000 - days * 86400000).toISOString()
  const amazonOrder = (orderId: string, createdTime: string, quantity: number) => ({
    orderId,
    createdTime,
    salesChannel: { channelName: "AMAZON", marketplaceId: "ATVPDKIKX0DER" },
    fulfillment: { fulfillmentStatus: "SHIPPED", fulfilledBy: "AMAZON" },
    orderItems: [
      {
        orderItemId: `${orderId}-1`,
        quantityOrdered: quantity,
        product: { sellerSku: "foil-2", asin: "B000000001" },
        fulfillment: { quantityFulfilled: quantity }
      }
    ]
  })
  // Answers each Amazon read with the listed orders created in its period.
  function amazonOrders(orders: ReturnType<typeof amazonOrder>[]) {
    provider.api.request.mockImplementation(async (_method: string, path: string) => {
      // The order sync also copies Amazon's transactions for fees; none are posted here.
      if (path.startsWith("/finances/")) {
        return { payload: { transactions: [] } }
      }
      const query = new URL(path, "https://amazon.test").searchParams
      const from = Date.parse(query.get("createdAfter") ?? ""),
        to = Date.parse(query.get("createdBefore") ?? "")
      return {
        orders: orders.filter((order) => Date.parse(order.createdTime) >= from && Date.parse(order.createdTime) < to)
      }
    })
  }
  beforeEach(async () => {
    await orderConnectionsAmazonOnly()
    provider.connection.mockImplementation(async (orgId: string, kind: string) => {
      const rows = await database.select().from(tables.connections)
      const row = rows.find((row) => row.orgId === orgId && row.provider === kind)
      if (!row) {
        throw new Error("not connected")
      }
      return row
    })
  })
  it("reads newest first, then keeps the stored range unbroken while refreshing and extending it", () => {
    const now = Date.parse("2026-09-25T12:00:00Z")
    const end = Date.parse("2026-09-25T11:57:00Z")
    const first = syncChunks(now, { coveredFrom: null, coveredTo: null })
    expect(first.fresh).toBe(true)
    // Two years, less a day, in 14-day periods.
    expect(first.chunks).toHaveLength(53)
    expect(first.chunks[0]!.to.getTime()).toBe(end)
    expect(first.chunks.at(-1)!.from.getTime()).toBe(end - 729 * 86400000)
    // The full history stored until yesterday: only the last 31 days are read again.
    const later = syncChunks(now, { coveredFrom: first.chunks.at(-1)!.from, coveredTo: new Date(now - 86400000) })
    expect(later.fresh).toBe(false)
    expect(later.chunks).toHaveLength(3)
    expect(later.chunks[0]!.from.getTime()).toBe(now - 31 * 86400000)
    // 180 days stored: refresh the recent end, then extend backwards from the stored start.
    const storedFrom = new Date(end - 180 * 86400000)
    const extended = syncChunks(now, { coveredFrom: storedFrom, coveredTo: new Date(end) })
    expect(extended.chunks.slice(0, 3).map((chunk) => chunk.to.getTime() <= end)).toEqual([true, true, true])
    expect(extended.chunks[3]).toEqual({ from: new Date(storedFrom.getTime() - 14 * 86400000), to: storedFrom })
    expect(extended.chunks.at(-1)!.from.getTime()).toBe(end - 729 * 86400000)
    // A stored range entirely before the history start is replaced.
    expect(syncChunks(now, { coveredFrom: new Date(0), coveredTo: new Date(86400000) }).fresh).toBe(true)
  })
  it("starts a new store's orders and each of its stock sources, and reports how much history is copied", async () => {
    await startFirstSync(buyer.org, "amazon")
    await startFirstSync(buyer.org, "amazon")
    const queued = await database.select({ kind: tables.jobs.kind }).from(tables.jobs)
    expect(queued.map((job) => job.kind).toSorted()).toEqual(["sales", "stock", "stock"])
    const snapshots = await database.select().from(tables.stockSnapshots)
    expect(snapshots.map((row) => [row.source, row.status]).toSorted()).toEqual([
      ["awd", "queued"],
      ["fba", "queued"]
    ])
    const amazon = (await salesSyncStatus(buyerId)).find((state) => state.source === "amazon")
    expect(amazon).toMatchObject({ status: "queued", progress: 0 })
  })
  it("measures a first sync's progress by the history copied, and has none for later syncs", () => {
    const day = 86400000
    const now = Date.now()
    const copying = (days: number) => ({
      status: "running",
      coveredFrom: new Date(now - days * day),
      coveredTo: new Date(now)
    })
    expect(orderSyncProgress({ status: "queued", coveredFrom: null, coveredTo: null }, 60)).toBe(0)
    expect(orderSyncProgress(copying(15), 60)).toBe(0.25)
    // A later sync already has the history.
    expect(orderSyncProgress(copying(60), 60)).toBeNull()
    expect(orderSyncProgress({ ...copying(15), status: "idle" }, 60)).toBeNull()
  })
  it("copies orders, lists them and computes demand without asking Amazon again", async () => {
    amazonOrders([amazonOrder("111-1", daysAgo(10), 2), amazonOrder("111-2", daysAgo(100), 3)])
    await expect(storedDemand(buyerId, "amazon", 28)).rejects.toThrow("Sync Amazon orders")
    expect(await requestSalesSync(buyer.org, "amazon")).toEqual({ status: "queued" })
    expect(await requestSalesSync(buyer.org, "amazon")).toEqual({ status: "queued" })
    expect(await database.select().from(tables.jobs)).toHaveLength(1)
    await drainSales()
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ status: "idle", externalAccountId: "A123456789", errorCode: null })
    expect(await salesSyncStatus(buyerId)).toMatchObject([{ source: "amazon", recent: { orders: 1, units: 2 } }])
    expect(await listSalesOrders(buyerId, { page: 0 })).toMatchObject({
      total: 2,
      orders: [
        {
          source: "amazon",
          number: "111-1",
          units: 2,
          items: [{ sku: "foil-2", quantity: 2 }],
          channel: "Amazon FBA",
          status: "Shipped",
          url: "https://sellercentral.amazon.com/orders-v3/order/111-1"
        },
        { number: "111-2", units: 3 }
      ]
    })
    expect((await listSalesOrders(buyerId, { page: 0, q: "111-2" })).orders.map((order) => order.number)).toEqual([
      "111-2"
    ])
    expect((await listSalesOrders(buyerId, { page: 0, q: "100%" })).total).toBe(0)
    const calls = provider.api.request.mock.calls.length
    const demand = await storedDemand(buyerId, "amazon", 28)
    expect(demand.rows).toEqual([expect.objectContaining({ buyerSku: "foil-2", pool: "fba", fulfilledUnits: 2 })])
    expect(demand.window.to).toBe(sync!.coveredTo!.toISOString())
    expect((await storedDemand(buyerId, "amazon", 120)).rows[0]?.fulfilledUnits).toBe(5)
    await expect(storedDemand(buyerId, "amazon", 800)).rejects.toThrow("go back 729 days")
    expect(provider.api.request.mock.calls.length).toBe(calls)
  })
  it("leaves out Shopify orders with an excluded tag, such as Shopify's copies of Amazon orders", async () => {
    amazonOrders([amazonOrder("111-1", daysAgo(10), 2)])
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    const shop = "test.myshopify.com"
    await database
      .insert(tables.connections)
      .values({ orgId: buyerId, provider: "shopify", externalId: shop, encryptedToken: "test-only", scopes: "" })
    const shopifyOrder = (id: string, name: string, sourceName: string, tags: string[] = []) => ({
      orgId: buyerId,
      source: "shopify" as const,
      externalAccountId: shop,
      orderId: id,
      orderedAt: new Date(daysAgo(9)),
      data: {
        id,
        name,
        createdAt: daysAgo(9),
        cancelledAt: null,
        test: false,
        sourceName,
        tags,
        lines: [],
        fulfillments: [],
        transactions: []
      }
    })
    await database.insert(tables.salesOrders).values([
      shopifyOrder("gid://shopify/Order/1", "#1001", "web"),
      shopifyOrder("gid://shopify/Order/2", "#1002", "amazon-us", ["amazon", "FBA"]),
      // An untagged order remains included.
      {
        ...shopifyOrder("gid://shopify/Order/3", "#1003", "amazon"),
        data: { ...shopifyOrder("gid://shopify/Order/3", "#1003", "amazon").data, tags: [] }
      }
    ])
    expect((await shopifyOrderTags(buyerId)).toSorted()).toEqual(["FBA", "amazon"].toSorted())
    const shopifyStatus = async () => (await salesSyncStatus(buyerId)).find((state) => state.source === "shopify")
    expect(await shopifyStatus()).toMatchObject({ orders: 2, recent: { orders: 2 } })
    const listed = await listSalesOrders(buyerId, { page: 0 })
    expect(listed.total).toBe(3)
    expect(listed.orders.map((order) => order.number).toSorted()).toEqual(["#1001", "#1003", "111-1"])
    expect((await listSalesOrders(buyerId, { page: 0, source: "shopify" })).total).toBe(2)
    // Orders are found by their products' titles: Amazon's by SKU, Shopify's by variant.
    const catalogRow = {
      inventoryItemId: "gid://shopify/InventoryItem/77",
      tracked: true,
      unit: "shopify_inventory_unit" as const,
      levels: [],
      productId: "gid://shopify/Product/77",
      imageUrl: null,
      productTitle: "Foil Wire",
      variantTitle: "Red / Left"
    }
    await database.insert(tables.stockSnapshots).values({
      orgId: buyerId,
      source: "shopify",
      externalAccountId: shop,
      scopeKey: "store",
      data: {
        source: "shopify",
        scopeKey: "store",
        shopifyDomain: shop,
        startedAt: daysAgo(1),
        observedAt: daysAgo(1),
        rows: [
          { ...catalogRow, variantId: "gid://shopify/ProductVariant/77", buyerSku: "foil-2" },
          {
            ...catalogRow,
            variantId: "gid://shopify/ProductVariant/78",
            buyerSku: null,
            productTitle: "Mask Cord",
            variantTitle: "Default Title"
          }
        ]
      }
    })
    const line = {
      id: "gid://shopify/LineItem/1",
      quantity: 1,
      currentQuantity: 1,
      sku: null,
      variant: { id: "gid://shopify/ProductVariant/78" },
      lineItemGroup: null,
      originalUnitPriceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } },
      discountAllocations: []
    }
    await database
      .update(tables.salesOrders)
      .set({ data: { ...shopifyOrder("gid://shopify/Order/1", "#1001", "web").data, lines: [line] } })
      .where(eq(tables.salesOrders.orderId, "gid://shopify/Order/1"))
    const found = async (q: string) =>
      (await listSalesOrders(buyerId, { page: 0, q })).orders.map((order) => order.number).toSorted()
    expect(await found("wire left")).toEqual(["111-1"])
    expect(await found("mask CORD")).toEqual(["#1001"])
    expect(await found("wire mask")).toEqual([])
    // Someone who doesn't see prices can't find orders by their amounts, only by number, SKU and product.
    const unpriced = async (q: string) =>
      (await listSalesOrders(buyerId, { page: 0, q }, { prices: false })).orders.map((order) => order.number).toSorted()
    expect(await found("10.00")).toEqual(["#1001"])
    expect(await unpriced("10.00")).toEqual([])
    expect(await unpriced("1001")).toEqual(["#1001"])
    expect(await unpriced("FOIL-2")).toEqual(["111-1"])
    expect(await unpriced("mask cord")).toEqual(["#1001"])
    // Restock doesn't count them as Shopify demand either.
    await database.insert(tables.salesSyncs).values({
      orgId: buyerId,
      source: "shopify",
      externalAccountId: shop,
      coveredFrom: new Date(daysAgo(40)),
      coveredTo: new Date()
    })
    await database
      .update(tables.salesOrders)
      .set({
        data: {
          ...shopifyOrder("gid://shopify/Order/2", "#1002", "amazon-us", ["amazon", "FBA"]).data,
          lines: [{ ...line, id: "gid://shopify/LineItem/2", variant: { id: "gid://shopify/ProductVariant/79" } }]
        }
      })
      .where(eq(tables.salesOrders.orderId, "gid://shopify/Order/2"))
    const demand = await storedDemand(buyerId, "shopify", 28)
    expect([...demand.saleDays.keys()]).toEqual(["gid://shopify/ProductVariant/78"])
    expect(demand.gaps.map((gap) => gap.variantId)).not.toContain("gid://shopify/ProductVariant/79")
    // With no excluded tags, every Shopify order counts.
    const save = (tags: string[]) =>
      action(
        new Request("http://localhost:3000/api/action", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ action: "workspace.excludedShopifyTags", data: { tags } })
        })
      )
    expect((await save([])).status).toBe(200)
    expect(await shopifyStatus()).toMatchObject({ orders: 3, recent: { orders: 3 } })
    expect((await listSalesOrders(buyerId, { page: 0 })).total).toBe(4)
    expect((await save([" FBA ", "fba", "Amazon"])).status).toBe(200)
    const [org] = await database.select().from(tables.organizations).where(eq(tables.organizations.id, buyerId))
    expect(org?.excludedShopifyTags).toEqual(["FBA", "Amazon"])
    expect(await shopifyStatus()).toMatchObject({ orders: 2 })
    // * matches any run of characters, and _ or % match only themselves.
    expect((await save(["AMA*"])).status).toBe(200)
    expect(await shopifyStatus()).toMatchObject({ orders: 2 })
    expect((await save(["*b*"])).status).toBe(200)
    expect(await shopifyStatus()).toMatchObject({ orders: 2 })
    expect((await save(["f_a", "a%"])).status).toBe(200)
    expect(await shopifyStatus()).toMatchObject({ orders: 3 })
    await database.delete(tables.salesOrders).where(eq(tables.salesOrders.orderId, "gid://shopify/Order/3"))
  })
  it("drops orders that disappear from the source when the period is synced again", async () => {
    amazonOrders([amazonOrder("111-1", daysAgo(10), 2), amazonOrder("111-2", daysAgo(100), 3)])
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    amazonOrders([amazonOrder("111-2", daysAgo(100), 3)])
    const orderReads = () =>
      provider.api.request.mock.calls.filter((call) => String(call[1]).startsWith("/orders/")).length
    const before = orderReads()
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    expect((await listSalesOrders(buyerId, { page: 0 })).orders.map((order) => order.number)).toEqual(["111-2"])
    // Only the recent periods are read again.
    expect(orderReads() - before).toBe(3)
  })
  it("gets a current Shopify token for each period, so a long sync outlives an hour-long token", async () => {
    await database.insert(tables.connections).values({
      orgId: buyerId,
      provider: "shopify",
      externalId: "test.myshopify.com",
      encryptedToken: "test-only",
      scopes: "read_orders"
    })
    const graphql = vi.fn<() => Promise<unknown>>().mockResolvedValue({
      shop: { myshopifyDomain: "test.myshopify.com" },
      orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
    })
    provider.shopifyFor.mockResolvedValue({ graphql })
    await requestSalesSync(buyer.org, "shopify")
    await drainSales()
    const [sync] = await database
      .select()
      .from(tables.salesSyncs)
      .where(and(eq(tables.salesSyncs.orgId, buyerId), eq(tables.salesSyncs.source, "shopify")))
    expect(sync?.status).toBe("idle")
    // 60 days of history (no read_all_orders) is five 14-day periods, each with its own client.
    // Financial evidence is queued independently.
    expect(graphql).toHaveBeenCalledTimes(5)
    expect(provider.shopifyFor).toHaveBeenCalledTimes(5)
    // Without the payouts permission, labels and Shopify charges wait for the store to reconnect.
    expect(sync?.feesErrorCode).toBe("reconnect")
    expect(sync?.customersIncluded).toBe(false)
    // Granting customer access must reread history, not merely refresh its most recent 30 days.
    await database
      .update(tables.connections)
      .set({ scopes: "read_orders,read_customers" })
      .where(and(eq(tables.connections.orgId, buyerId), eq(tables.connections.provider, "shopify")))
    // Finish the independent analytics job queued by the preceding sales sync.
    await runNextJob()
    graphql.mockClear()
    await requestSalesSync(buyer.org, "shopify")
    await drainSales()
    const [withCustomers] = await database
      .select()
      .from(tables.salesSyncs)
      .where(and(eq(tables.salesSyncs.orgId, buyerId), eq(tables.salesSyncs.source, "shopify")))
    expect(withCustomers).toMatchObject({ status: "idle", customersIncluded: true })
    expect(graphql).toHaveBeenCalledTimes(5)
    // Subsequent syncs preserve customer coverage and read only the recent window.
    // Finish the independent analytics job queued by the preceding sales sync.
    await runNextJob()
    graphql.mockClear()
    await requestSalesSync(buyer.org, "shopify")
    await drainSales()
    expect(graphql).toHaveBeenCalledTimes(3)
  })

  it("restarts the complete history when customer permission changes between checkpoints", async () => {
    await database.insert(tables.connections).values({
      orgId: buyerId,
      provider: "shopify",
      externalId: "test.myshopify.com",
      encryptedToken: "test-only",
      scopes: "read_orders"
    })
    const graphql = vi.fn<() => Promise<unknown>>().mockResolvedValue({
      shop: { myshopifyDomain: "test.myshopify.com" },
      orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
    })
    provider.shopifyFor.mockResolvedValue({ graphql })
    await requestSalesSync(buyer.org, "shopify")
    await runNextJob()
    expect(graphql).toHaveBeenCalledTimes(1)
    await database
      .update(tables.connections)
      .set({ scopes: "read_orders,read_customers" })
      .where(eq(tables.connections.orgId, buyerId))
    await database
      .update(tables.jobs)
      .set({ runAt: new Date(0) })
      .where(eq(tables.jobs.kind, "sales"))
    graphql.mockClear()
    await drainSales()
    // Re-read all five periods, including the one read before customer permission was granted.
    expect(graphql).toHaveBeenCalledTimes(5)
    const [sync] = await database.select().from(tables.salesSyncs).where(eq(tables.salesSyncs.orgId, buyerId))
    expect(sync).toMatchObject({ status: "idle", customersIncluded: true })
  })

  it("starts a sync again when the job of one still marked queued has failed", async () => {
    await requestSalesSync(buyer.org, "amazon")
    await database.update(tables.jobs).set({ status: "failed", error: "Unknown job type" })
    expect(await requestSalesSync(buyer.org, "amazon")).toEqual({ status: "queued" })
    const [sync] = await database.select().from(tables.salesSyncs).where(eq(tables.salesSyncs.orgId, buyerId))
    expect(sync?.revision).toBe(2)
    const pending = await database.select().from(tables.jobs).where(eq(tables.jobs.status, "pending"))
    expect(pending.map((job) => job.key)).toEqual([`sales:${buyerId}:amazon:2`])
  })

  it("pauses an Amazon sync that's throttled and resumes where it stopped, without holding the worker", async () => {
    const orders = [amazonOrder("111-1", daysAgo(3), 1), amazonOrder("111-2", daysAgo(40), 2)]
    const reads: string[] = []
    let throttle = true
    provider.api.request.mockImplementation(async (_method: string, path: string) => {
      if (path.startsWith("/finances/")) {
        return { payload: { transactions: [] } }
      }
      const query = new URL(path, "https://amazon.test").searchParams
      const from = Date.parse(query.get("createdAfter") ?? ""),
        to = Date.parse(query.get("createdBefore") ?? "")
      reads.push(query.get("createdAfter") ?? "")
      // The third period read is refused once.
      if (reads.length === 3 && throttle) {
        throttle = false
        throw new ProviderError(429, null, "throttled")
      }
      return {
        orders: orders.filter((order) => Date.parse(order.createdTime) >= from && Date.parse(order.createdTime) < to)
      }
    })
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    const [paused] = await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "sales"))
    expect(paused).toMatchObject({ status: "pending", attempts: 1 })
    expect(paused!.runAt.getTime()).toBeGreaterThan(Date.now() + 170000)
    const resume = (paused!.payload as { resume: { remaining: { from: string }[]; covered: unknown } }).resume
    expect(resume.remaining[0]!.from).toBe(reads[2])
    expect(resume.covered).not.toBeNull()
    const [waiting] = await database.select().from(tables.salesSyncs).where(eq(tables.salesSyncs.orgId, buyerId))
    expect(waiting?.status).toBe("running")

    await database.update(tables.jobs).set({ runAt: new Date() }).where(eq(tables.jobs.id, paused!.id))
    await drainSales()
    // The two periods read before the pause aren't read again.
    expect(reads.slice(3, 4)).toEqual([reads[2]])
    expect(reads.filter((from) => from === reads[0])).toHaveLength(1)
    const [done] = await database.select().from(tables.salesSyncs).where(eq(tables.salesSyncs.orgId, buyerId))
    expect(done?.status).toBe("idle")
    expect((await listSalesOrders(buyerId, { page: 0 })).orders.map((order) => order.number)).toEqual([
      "111-1",
      "111-2"
    ])
  })

  it("copies Amazon's transactions for fees", async () => {
    const posted = daysAgo(5)
    provider.api.request.mockImplementation(async (_method: string, path: string) => {
      if (!path.startsWith("/finances/")) {
        return { orders: [] }
      }
      const query = new URL(path, "https://amazon.test").searchParams
      const inWindow =
        Date.parse(posted) >= Date.parse(query.get("postedAfter") ?? "") &&
        Date.parse(posted) < Date.parse(query.get("postedBefore") ?? "")
      return {
        payload: {
          transactions: inWindow
            ? [
                {
                  transactionId: "t1",
                  transactionType: "Shipment",
                  postedDate: posted,
                  totalAmount: { currencyCode: "USD", currencyAmount: 12 },
                  relatedIdentifiers: [{ relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "111-1" }],
                  breakdowns: [
                    { breakdownType: "AmazonFees", breakdownAmount: { currencyCode: "USD", currencyAmount: -3 } }
                  ]
                }
              ]
            : []
        }
      }
    })
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    const [sync] = await database.select().from(tables.salesSyncs).where(eq(tables.salesSyncs.orgId, buyerId))
    expect(sync).toMatchObject({ status: "idle", feesErrorCode: null })
    expect(sync?.feesCoveredTo).not.toBeNull()
    expect((await salesSyncStatus(buyerId)).find((state) => state.source === "amazon")?.fees).toEqual({
      coveredFrom: sync?.feesCoveredFrom?.toISOString(),
      coveredTo: sync?.feesCoveredTo?.toISOString(),
      errorCode: null
    })
    expect(
      await database
        .select({
          transactionId: tables.amazonTransactions.transactionId,
          orderId: tables.amazonTransactions.orderId,
          totalMinor: tables.amazonTransactions.totalMinor,
          feesMinor: tables.amazonTransactions.feesMinor
        })
        .from(tables.amazonTransactions)
    ).toEqual([{ transactionId: "t1", orderId: "111-1", totalMinor: 1200, feesMinor: 300 }])
  })
  it("imports reimbursement evidence through the sales worker and exposes its independent coverage", async () => {
    amazonOrders([])
    const approvedAt = new Date(Date.now() - 86400000).toISOString()
    provider.api.report.mockImplementation(
      async (input: { reportType: string; dataStartTime: string; dataEndTime: string }) => {
        if (input.reportType !== "GET_FBA_REIMBURSEMENTS_DATA") {
          return null
        }
        const included = approvedAt >= input.dataStartTime && approvedAt <= input.dataEndTime
        return reimbursementReport(included ? [{ "approval-date": approvedAt }] : [])
      }
    )
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    expect(await database.select().from(tables.amazonReimbursements)).toMatchObject([
      { reimbursementId: "R1", amountTotal: "6.246912", externalAccountId: "A123456789" }
    ])
    const state = (await salesSyncStatus(buyerId)).find((source) => source.source === "amazon")
    expect(state?.status).toBe("idle")
    expect(state?.reimbursements?.windows.every((window) => window.complete)).toBe(true)
    expect(state?.returns?.windows.every((window) => !window.complete)).toBe(true)
    expect(await database.select().from(tables.amazonTransactions)).toEqual([])
  })
  it("imports detailed inventory movements through the worker independently of returns and reimbursements", async () => {
    amazonOrders([])
    const eventDay = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    provider.api.report.mockImplementation(
      async (input: { reportType: string; dataStartTime: string; dataEndTime: string }) => {
        if (input.reportType !== "GET_LEDGER_DETAIL_VIEW_DATA") {
          return null
        }
        const included = eventDay >= input.dataStartTime.slice(0, 10) && eventDay <= input.dataEndTime.slice(0, 10)
        return inventoryMovementReport(included ? [{ Date: eventDay }] : [])
      }
    )
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    expect(await database.select().from(tables.amazonInventoryMovements)).toMatchObject([
      { eventDay, quantity: -3, referenceId: "REF1", externalAccountId: "A123456789" }
    ])
    const state = (await salesSyncStatus(buyerId)).find((source) => source.source === "amazon")
    expect(state?.status).toBe("idle")
    expect(state?.inventoryMovements?.windows.every((window) => window.complete)).toBe(true)
    expect(state?.reimbursements?.windows.every((window) => !window.complete)).toBe(true)
    expect(await database.select().from(tables.stockDays)).toEqual([])
  })
  it("imports both storage sources through the worker with independent coverage and no financial postings", async () => {
    amazonOrders([])
    provider.api.report.mockImplementation(async (input: { reportType: string; dataStartTime: string }) => {
      if (input.reportType === "GET_FBA_STORAGE_FEE_CHARGES_DATA") {
        return monthlyStorageReport([{ month_of_charge: input.dataStartTime.slice(0, 7) }])
      }
      if (input.reportType === "GET_FBA_FULFILLMENT_LONGTERM_STORAGE_FEE_CHARGES_DATA") {
        return agedStorageReport([{ "snapshot-date": input.dataStartTime.slice(0, 10) }])
      }
      return null
    })
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    expect(await database.select().from(tables.amazonStorageFees)).toHaveLength(24)
    const state = (await salesSyncStatus(buyerId)).find((source) => source.source === "amazon")
    expect(state?.status).toBe("idle")
    expect(state?.storageFees?.monthly.windows.every((window) => window.complete)).toBe(true)
    expect(state?.storageFees?.aged.windows.every((window) => window.complete)).toBe(true)
    expect(state?.returns?.windows.every((window) => !window.complete)).toBe(true)
    expect(await database.select().from(tables.amazonTransactions)).toEqual([])
  })
  it("imports removal orders and shipments through the worker without duplicate stock or money postings", async () => {
    amazonOrders([])
    provider.api.report.mockImplementation(async (input: { reportType: string; dataStartTime: string }) => {
      if (input.reportType === "GET_FBA_FULFILLMENT_REMOVAL_ORDER_DETAIL_DATA") {
        return removalReport("orders", [{ "request-date": input.dataStartTime }])
      }
      if (input.reportType === "GET_FBA_FULFILLMENT_REMOVAL_SHIPMENT_DETAIL_DATA") {
        return removalReport("shipments", [{ "shipment-date": input.dataStartTime }])
      }
      return null
    })
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    const state = (await salesSyncStatus(buyerId)).find((source) => source.source === "amazon")
    expect(state?.status).toBe("idle")
    expect(state?.removals?.orders.windows.every((window) => window.complete)).toBe(true)
    expect(state?.removals?.shipments.windows.every((window) => window.complete)).toBe(true)
    expect(state?.storageFees?.monthly.windows.every((window) => !window.complete)).toBe(true)
    expect(await database.select().from(tables.amazonRemovals)).toHaveLength(2)
    expect(await database.select().from(tables.amazonRemovalReports)).toHaveLength(
      (state?.removals?.orders.windows.length ?? 0) * 2
    )
    expect(await database.select().from(tables.amazonTransactions)).toEqual([])
    expect(await database.select().from(tables.stockDays)).toEqual([])
  })
  it("copies daily FBA stock from Amazon's ledger and counts stockout days, except days the item sold", async () => {
    const dayMs = 86400000
    const today = Math.floor(Date.now() / dayMs) * dayMs
    const day = (ago: number) => new Date(today - ago * dayMs).toISOString().slice(0, 10)
    amazonOrders([amazonOrder("111-1", new Date(today - 3 * dayMs + 3600000).toISOString(), 2)])
    const inStock = [day(5), day(4)]
    provider.api.report.mockImplementation(async (input: { dataStartTime: string; dataEndTime: string }) => {
      const rows = inStock
        .filter((value) => value >= input.dataStartTime.slice(0, 10) && value <= input.dataEndTime.slice(0, 10))
        .map((value) => [value, "X1", "foil-2", "SELLABLE", "5"].join("\t"))
      return [["Date", "FNSKU", "MSKU", "Disposition", "Ending Warehouse Balance"].join("\t"), ...rows].join("\n")
    })
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ stockErrorCode: null, stockCoveredTo: new Date(today) })
    const rows = await database.select().from(tables.stockDays)
    expect(rows.map((row) => [row.itemKey, row.day, row.units, row.origin])).toEqual([
      ["foil-2", day(5), 5, "ledger"],
      ["foil-2", day(4), 5, "ledger"]
    ])
    const demand = await storedDemand(buyerId, "amazon", 10)
    const out = await stockoutDays({
      orgId: buyerId,
      externalAccountId: "A123456789",
      pool: "fba",
      scope: "ATVPDKIKX0DER",
      itemKeys: ["foil-2"],
      from: new Date(today - 10 * dayMs),
      to: new Date(today),
      ledger: { from: sync!.stockCoveredFrom!, to: sync!.stockCoveredTo! },
      saleDays: demand.saleDays
    })
    // Ten days: in stock on two, sold on a third.
    expect(out.get("foil-2")).toBe(7)
  })
  it("keeps the lowest stock seen each day from stock syncs", async () => {
    const fba = (units: number) => ({
      source: "fba" as const,
      scopeKey: "ATVPDKIKX0DER" as const,
      startedAt: "2026-09-25T00:00:00Z",
      observedAt: "2026-09-25T00:00:00Z",
      rows: [
        {
          sellerSku: "foil-2",
          unit: "amazon_sellable_unit" as const,
          totalQuantity: units,
          inventoryDetails: {
            fulfillableQuantity: units,
            inboundWorkingQuantity: 0,
            inboundShippedQuantity: 0,
            inboundReceivingQuantity: 0
          }
        }
      ]
    })
    const now = Date.parse("2026-09-25T12:00:00Z")
    await recordStockDays(buyerId, "A123456789", fba(4), now)
    await recordStockDays(buyerId, "A123456789", fba(0), now + 3600000)
    await recordStockDays(buyerId, "A123456789", fba(9), now + 7200000)
    expect(await database.select().from(tables.stockDays)).toMatchObject([
      { pool: "fba", itemKey: "foil-2", day: "2026-09-25", units: 0, origin: "snapshot" }
    ])
  })
  it("records a failed sync and keeps the orders already copied", async () => {
    provider.api.request.mockRejectedValue(new Error("private provider text"))
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ status: "failed", errorCode: "refresh_failed", coveredTo: null })
    await expect(requestSalesSync(supplier.org, "amazon")).rejects.toThrow("buyer workspace")
  })
})
