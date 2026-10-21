import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { ShopifyRequestError } from "@repo/copacker-marketplaces/shopify"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.current }))
const shopify = vi.hoisted(() => ({
  graphql: vi.fn<(...args: never[]) => Promise<unknown>>(),
  subscribeWebhooks: vi.fn<(...args: never[]) => Promise<string[]>>()
}))
vi.mock("../src/server/connections", async (original) => ({
  ...(await original<typeof import("../src/server/connections")>()),
  shopifyFor: async () => shopify
}))
import { emailJob, PollAgain } from "../src/server/job-handlers"
import { queueReconciliation, reconcileJob } from "../src/server/reconcile"
import { shopifyComplianceJob } from "../src/server/shopify-compliance"
import {
  pollShopifyEvents,
  receiveShopifyEvent,
  shopifyEventJob,
  shopifySubscribeJob,
  shopifyWebhookTopics
} from "../src/server/shopify-webhooks"
import { applySchema } from "./database"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const buyerId = randomUUID(),
  otherBuyerId = randomUUID()
const shop = "test.myshopify.com"
const owned = vi.fn<() => Promise<void>>()

const source = "arn:aws:events:us-east-1::event-source/aws.partner/shopify.com/428016009217/copacker-production"
// As Shopify's EventBridge integration delivers a webhook: its headers as metadata, its body as the payload.
function event(topic: string, payload: unknown = { id: 1 }) {
  return JSON.stringify({
    version: "0",
    id: `event-${topic}`,
    "detail-type": "shopifyWebhook",
    source: "aws.partner/shopify.com/428016009217/copacker-production",
    detail: {
      payload,
      metadata: {
        "Content-Type": "application/json",
        "X-Shopify-Topic": topic,
        "X-Shopify-Shop-Domain": shop,
        "X-Shopify-Webhook-Id": `webhook-${topic}`
      }
    }
  })
}
async function connect(orgId: string, externalId = shop) {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "shopify", externalId, encryptedToken: "test-only", scopes: "read_orders" })
}
const queued = (kind: string) =>
  database
    .select()
    .from(tables.jobs)
    .then((rows) => rows.filter((row) => row.kind === kind))

beforeAll(async () => {
  context.current = database
  await applySchema(pg)
})
afterAll(async () => {
  await pg.close()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
beforeEach(async () => {
  vi.resetAllMocks()
  await pg.exec("TRUNCATE organizations, jobs CASCADE")
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Buyer", kind: "buyer" },
    { id: otherBuyerId, name: "Other buyer", kind: "buyer" }
  ])
  await connect(buyerId)
})

describe("Shopify events", () => {
  it("gathers a burst of order events into one sync per connected workspace, after the orders settle", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-09-25T12:01:00Z"), toFake: ["Date"] })
    await connect(otherBuyerId)
    expect(await receiveShopifyEvent(event("orders/create"))).toBe(true)
    expect(await receiveShopifyEvent(event("orders/updated"))).toBe(true)
    const jobs = await queued("shopify-event")
    expect(jobs).toHaveLength(2)
    expect(jobs.map((job) => job.payload.orgId).sort()).toEqual([buyerId, otherBuyerId].sort())
    expect(jobs[0]).toMatchObject({ payload: { shop, target: "sales" }, runAt: new Date("2026-09-25T12:08:00Z") })
    expect(await receiveShopifyEvent(event("inventory_levels/update"))).toBe(true)
    expect(await queued("shopify-event")).toHaveLength(4)
  })

  it("refreshes stock for any change to products, variants, inventory items, stock levels or locations", async () => {
    const topics = [
      "products/update",
      "products/delete",
      "inventory_items/update",
      "inventory_levels/connect",
      "inventory_levels/disconnect",
      "locations/deactivate"
    ]
    for (const topic of topics) {
      expect(await receiveShopifyEvent(event(topic))).toBe(true)
    }
    expect(await queued("shopify-event")).toMatchObject([{ payload: { orgId: buyerId, shop, target: "stock" } }])
  })

  it("syncs orders for refunds, edits and payments", async () => {
    for (const topic of ["refunds/create", "orders/edited", "order_transactions/create"]) {
      expect(await receiveShopifyEvent(event(topic))).toBe(true)
    }
    expect(await queued("shopify-event")).toMatchObject([{ payload: { target: "sales" } }])
  })

  it("handles every topic it subscribes to", async () => {
    const unhandled = []
    for (const topic of shopifyWebhookTopics) {
      await pg.exec("TRUNCATE jobs")
      const name = topic.toLowerCase().replace(/_(?=[a-z]+$)/, "/")
      await receiveShopifyEvent(event(name))
      if ((await queued("shopify-event")).length !== 1) {
        unhandled.push(name)
      }
    }
    expect(unhandled).toEqual([])
  })

  it("acknowledges topics and stores it doesn't handle without queueing work", async () => {
    expect(await receiveShopifyEvent(event("collections/update"))).toBe(true)
    await pg.exec("TRUNCATE connections")
    expect(await receiveShopifyEvent(event("orders/create"))).toBe(true)
    expect(await database.select().from(tables.jobs)).toEqual([])
  })

  it("drops messages that aren't Shopify events", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect(await receiveShopifyEvent("not json")).toBe(false)
    expect(await receiveShopifyEvent(JSON.stringify({ detail: {} }))).toBe(false)
    warned.mockRestore()
    expect(await database.select().from(tables.jobs)).toEqual([])
  })

  it("removes each message from the queue once its work is queued", async () => {
    const queue = {
      receive: vi
        .fn<() => Promise<{ body: string; handle: string }[]>>()
        .mockResolvedValue([{ body: event("orders/create"), handle: "h1" }]),
      remove: vi.fn<(handle: string) => Promise<void>>()
    }
    expect(await pollShopifyEvents(queue)).toBe(1)
    expect(queue.remove).toHaveBeenCalledWith("h1")
    expect(await queued("shopify-event")).toHaveLength(1)
  })
})

describe("Shopify event jobs", () => {
  it("starts an order sync, and waits for a running sync to finish before starting another", async () => {
    await shopifyEventJob({ orgId: buyerId, shop, target: "sales" })
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ source: "shopify", status: "queued", externalAccountId: shop })
    await pg.exec(`UPDATE sales_syncs SET status = 'running'`)
    await expect(shopifyEventJob({ orgId: buyerId, shop, target: "sales" })).rejects.toBeInstanceOf(PollAgain)
  })

  it("refreshes Shopify stock", async () => {
    await shopifyEventJob({ orgId: buyerId, shop, target: "stock" })
    const [snapshot] = await database.select().from(tables.stockSnapshots)
    expect(snapshot).toMatchObject({ source: "shopify", status: "queued", externalAccountId: shop })
  })

  it("ignores an event for a store the workspace no longer uses", async () => {
    await pg.exec("TRUNCATE connections")
    await connect(buyerId, "other.myshopify.com")
    await shopifyEventJob({ orgId: buyerId, shop, target: "sales" })
    await shopifyEventJob({ orgId: buyerId, shop, target: "uninstalled" })
    expect(await database.select().from(tables.salesSyncs)).toEqual([])
    expect(await database.select().from(tables.connections)).toHaveLength(1)
  })

  it("disconnects an uninstalled store only once Shopify refuses its authorization", async () => {
    shopify.graphql.mockResolvedValueOnce({ shop: { id: "gid://shopify/Shop/1" } })
    await shopifyEventJob({ orgId: buyerId, shop, target: "uninstalled" })
    expect(await database.select().from(tables.connections)).toHaveLength(1)
    shopify.graphql.mockRejectedValueOnce(new Error("network down"))
    await expect(shopifyEventJob({ orgId: buyerId, shop, target: "uninstalled" })).rejects.toThrow("network down")
    shopify.graphql.mockRejectedValueOnce(new ShopifyRequestError(401))
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(null, { status: 401 }))
    )
    await shopifyEventJob({ orgId: buyerId, shop, target: "uninstalled" })
    vi.unstubAllGlobals()
    expect(await database.select().from(tables.connections)).toEqual([])
  })
})

describe("Shopify webhook subscriptions", () => {
  it("subscribes the connected store at the EventBridge source", async () => {
    vi.stubEnv("SHOPIFY_EVENTBRIDGE_SOURCE_ARN", source)
    await shopifySubscribeJob({ orgId: buyerId }, owned)
    // Without read_fulfillments, Shopify would refuse the shipment topics.
    const withoutShipments = shopifyWebhookTopics.filter((topic) => !topic.startsWith("FULFILLMENTS_"))
    expect(withoutShipments).toHaveLength(shopifyWebhookTopics.length - 2)
    expect(shopify.subscribeWebhooks.mock.calls).toEqual([[source, withoutShipments]])
    await shopifySubscribeJob({ orgId: otherBuyerId }, owned)
    expect(shopify.subscribeWebhooks).toHaveBeenCalledTimes(1)
    await pg.exec("UPDATE connections SET scopes = 'read_orders,read_fulfillments'")
    await shopifySubscribeJob({ orgId: buyerId }, owned)
    expect(shopify.subscribeWebhooks).toHaveBeenLastCalledWith(source, shopifyWebhookTopics)
    vi.stubEnv("SHOPIFY_EVENTBRIDGE_SOURCE_ARN", "arn:aws:sqs:us-east-1:1:not-a-source")
    await expect(shopifySubscribeJob({ orgId: buyerId }, owned)).rejects.toThrow("Invalid string")
  })

  it("skips subscribing without an EventBridge source", async () => {
    vi.stubEnv("SHOPIFY_EVENTBRIDGE_SOURCE_ARN", "")
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    await shopifySubscribeJob({ orgId: buyerId }, owned)
    expect(shopify.subscribeWebhooks).not.toHaveBeenCalled()
    warned.mockRestore()
  })
})

describe("daily reconciliation", () => {
  it("queues one run per day at 07:00 UTC", async () => {
    await queueReconciliation(new Date("2026-09-25T03:00:00Z"))
    await queueReconciliation(new Date("2026-09-25T15:00:00Z"))
    await queueReconciliation(new Date("2026-09-26T01:00:00Z"))
    expect((await queued("reconcile")).map((job) => [job.key, job.runAt.toISOString()])).toEqual([
      ["reconcile:2026-09-25", "2026-09-25T07:00:00.000Z"],
      ["reconcile:2026-09-26", "2026-09-26T07:00:00.000Z"]
    ])
  })

  it("syncs every buyer connection, refreshes the stock scopes in use, and renews Shopify subscriptions", async () => {
    await database
      .insert(tables.connections)
      .values({ orgId: otherBuyerId, provider: "amazon", externalId: "A123456789", encryptedToken: "test-only" })
    await database.insert(tables.stockSnapshots).values([
      { orgId: otherBuyerId, source: "fba", externalAccountId: "A123456789", scopeKey: "ATVPDKIKX0DER" },
      // Left from an Amazon account the workspace no longer uses.
      { orgId: otherBuyerId, source: "awd", externalAccountId: "A000000000", scopeKey: "us" }
    ])
    await reconcileJob({ date: "2026-09-25" }, owned)
    const syncs = await database.select().from(tables.salesSyncs)
    expect(syncs.map((sync) => [sync.orgId, sync.source, sync.status]).sort()).toEqual(
      [
        [buyerId, "shopify", "queued"],
        [otherBuyerId, "amazon", "queued"]
      ].sort()
    )
    const snapshots = await database.select().from(tables.stockSnapshots)
    expect(snapshots.map((snapshot) => [snapshot.source, snapshot.status]).sort()).toEqual([
      ["awd", "idle"],
      ["fba", "queued"]
    ])
    expect((await queued("shopify-subscribe")).map((job) => job.key)).toEqual([
      `shopify-subscribe:${buyerId}:2026-09-25`
    ])
    expect((await queued("amazon-subscribe")).map((job) => job.key)).toEqual([
      `amazon-subscribe:${otherBuyerId}:2026-09-25`
    ])
  })
})

describe("Shopify privacy webhooks", () => {
  async function storeOrder(orgId: string, id: number, sku: string) {
    const line = {
      originalUnitPriceSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
      discountAllocations: [],
      id: `gid://shopify/LineItem/${id}`,
      quantity: 2,
      currentQuantity: 2,
      sku,
      variant: null
    }
    await database.insert(tables.salesOrders).values({
      orgId,
      source: "shopify",
      externalAccountId: shop,
      orderId: `gid://shopify/Order/${id}`,
      orderedAt: new Date("2026-09-01T10:00:00Z"),
      data: {
        tags: [],
        transactions: [],
        id: `gid://shopify/Order/${id}`,
        name: `#${id}`,
        createdAt: "2026-09-01T10:00:00Z",
        cancelledAt: null,
        test: false,
        sourceName: "web",
        lines: [line],
        fulfillments: []
      }
    })
  }
  const dataRequest = {
    shop_id: 1,
    shop_domain: shop,
    orders_requested: [1001, 1003],
    customer: { id: 7, email: "customer@example.com", phone: "555-0100" },
    data_request: { id: 42 }
  }

  it("sends workspace owners the stored details of the requested orders, without keeping contact details", async () => {
    await database.insert(tables.memberships).values([
      { orgId: buyerId, userId: "owner", email: "owner@example.com", role: "owner" },
      { orgId: buyerId, userId: "member", email: "member@example.com", role: "member" }
    ])
    await storeOrder(buyerId, 1001, "CORD-2")
    await storeOrder(buyerId, 1002, "MASK-1")
    // Shopify can deliver the same event twice; it's handled once.
    expect(await receiveShopifyEvent(event("customers/data_request", dataRequest))).toBe(true)
    expect(await receiveShopifyEvent(event("customers/data_request", dataRequest))).toBe(true)
    const [job] = await queued("shopify-compliance")
    expect(await queued("shopify-compliance")).toHaveLength(1)
    expect(JSON.stringify(job!.payload)).not.toContain("customer@example.com")
    await shopifyComplianceJob(job!.payload)
    const emails = await queued("email")
    expect(emails.map((email) => email.payload)).toEqual([
      {
        type: "data_request",
        to: "owner@example.com",
        shop,
        requestId: 42,
        orders: ["Order #1001, placed 2026-09-01, status Unfulfilled: 2 × CORD-2"]
      }
    ])
    vi.stubEnv("EMAIL_API_KEY", "test")
    vi.stubEnv("EMAIL_FROM", "copacker@example.com")
    const send = vi.fn<typeof fetch>(async () => Response.json({ id: "sent" }))
    vi.stubGlobal("fetch", send)
    await emailJob(emails[0]!.payload, emails[0]!.key, owned)
    vi.unstubAllGlobals()
    const sent = JSON.parse(String(send.mock.calls[0]![1]!.body)) as { subject: string; html: string; text: string }
    expect(sent.subject).toBe(`Customer data request for ${shop}`)
    for (const version of [sent.html, sent.text]) {
      expect(version).toContain("Order #1001, placed 2026-09-01")
      expect(version).not.toContain("#1002")
    }
  })

  it("removes an erased customer's ID from their stored orders, keeping only IDs from the request", async () => {
    await storeOrder(buyerId, 1001, "CORD-2")
    await storeOrder(buyerId, 1002, "CORD-2")
    await storeOrder(buyerId, 1003, "CORD-2")
    await database.execute(
      sql`update sales_orders set data = data || jsonb_build_object('customerId', case "orderId"
        when 'gid://shopify/Order/1003' then 'gid://shopify/Customer/8' else 'gid://shopify/Customer/7' end)`
    )
    const body = {
      shop_domain: shop,
      customer: { id: 7, email: "customer@example.com", phone: "555-0100" },
      orders_to_redact: [1001]
    }
    expect(await receiveShopifyEvent(event("customers/redact", body))).toBe(true)
    const [job] = await queued("shopify-compliance")
    expect(JSON.stringify(job!.payload)).not.toContain("customer@example.com")
    await shopifyComplianceJob(job!.payload)
    const stored = await database.select().from(tables.salesOrders)
    expect(
      Object.fromEntries(stored.map((row) => [row.orderId, "lines" in row.data ? (row.data.customerId ?? null) : null]))
    ).toEqual({
      "gid://shopify/Order/1001": null,
      "gid://shopify/Order/1002": null,
      // Another customer's order keeps its ID.
      "gid://shopify/Order/1003": "gid://shopify/Customer/8"
    })
  })

  it("rejects a privacy request it can't read", async () => {
    expect(await receiveShopifyEvent(event("customers/data_request", "not json"))).toBe(false)
    expect(await receiveShopifyEvent(event("shop/redact", { shop_id: 1 }))).toBe(false)
    expect(await database.select().from(tables.jobs)).toEqual([])
  })

  it("erases a removed store's copied data, except in workspaces connected to it again", async () => {
    await storeOrder(buyerId, 1001, "CORD-2")
    await storeOrder(otherBuyerId, 1001, "CORD-2")
    await database.insert(tables.stockSnapshots).values([
      { orgId: buyerId, source: "shopify", externalAccountId: shop, scopeKey: "store" },
      { orgId: otherBuyerId, source: "shopify", externalAccountId: shop, scopeKey: "store" }
    ])
    expect(await receiveShopifyEvent(event("shop/redact", { shop_id: 1, shop_domain: shop }))).toBe(true)
    const [job] = await queued("shopify-compliance")
    await shopifyComplianceJob(job!.payload)
    expect((await database.select().from(tables.salesOrders)).map((row) => row.orgId)).toEqual([buyerId])
    expect((await database.select().from(tables.stockSnapshots)).map((row) => row.orgId)).toEqual([buyerId])
  })
})
