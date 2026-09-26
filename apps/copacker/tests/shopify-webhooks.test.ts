import { createHmac, randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { ShopifyRequestError } from "@repo/aisle/shopify"
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
import { POST as webhook } from "../src/app/api/webhooks/shopify/route"
import { emailJob, PollAgain } from "../src/server/job-handlers"
import { queueReconciliation, reconcileJob } from "../src/server/reconcile"
import { shopifyComplianceJob } from "../src/server/shopify-compliance"
import { shopifyEventJob, shopifySubscribeJob, shopifyWebhookTopics } from "../src/server/shopify-webhooks"
import { applyMigrations } from "./migrations"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const buyerId = randomUUID(),
  otherBuyerId = randomUUID()
const shop = "test.myshopify.com"
const secret = "test-client-secret"
const owned = vi.fn<() => Promise<void>>()

function delivery(topic: string, body = "{}", signature = createHmac("sha256", secret).update(body).digest("base64")) {
  return new Request("https://copacker.test/api/webhooks/shopify", {
    method: "POST",
    headers: {
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-hmac-sha256": signature,
      "x-shopify-webhook-id": `delivery-${topic}`
    },
    body
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
  await applyMigrations(pg)
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
  vi.stubEnv("SHOPIFY_CLIENT_SECRET", secret)
  await pg.exec("TRUNCATE organizations, jobs CASCADE")
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Buyer", kind: "buyer" },
    { id: otherBuyerId, name: "Other buyer", kind: "buyer" }
  ])
  await connect(buyerId)
})

describe("Shopify webhook deliveries", () => {
  it("rejects deliveries that Shopify didn't sign", async () => {
    expect(
      (await webhook(delivery("orders/create", "{}", "bm90IGEgcmVhbCBzaWduYXR1cmUgYXQgYWxsIG5vcGU="))).status
    ).toBe(401)
    expect((await webhook(delivery("orders/create", "{}", "garbage"))).status).toBe(401)
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "")
    expect((await webhook(delivery("orders/create"))).status).toBe(401)
    expect(await database.select().from(tables.jobs)).toEqual([])
  })

  it("gathers a burst of order events into one sync per connected workspace, after the orders settle", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-09-25T12:01:00Z"), toFake: ["Date"] })
    await connect(otherBuyerId)
    expect((await webhook(delivery("orders/create", '{"id":1}'))).status).toBe(200)
    expect((await webhook(delivery("orders/updated", '{"id":1}'))).status).toBe(200)
    const jobs = await queued("shopify-event")
    expect(jobs).toHaveLength(2)
    expect(jobs.map((job) => job.payload.orgId).sort()).toEqual([buyerId, otherBuyerId].sort())
    expect(jobs[0]).toMatchObject({ payload: { shop, target: "sales" }, runAt: new Date("2026-09-25T12:08:00Z") })
    expect((await webhook(delivery("inventory_levels/update"))).status).toBe(200)
    expect(await queued("shopify-event")).toHaveLength(4)
  })

  it("acknowledges topics and stores it doesn't handle without queueing work", async () => {
    expect((await webhook(delivery("products/update"))).status).toBe(200)
    await pg.exec("TRUNCATE connections")
    expect((await webhook(delivery("orders/create"))).status).toBe(200)
    expect(await database.select().from(tables.jobs)).toEqual([])
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
  it("subscribes the connected store at the app's HTTPS address", async () => {
    vi.stubEnv("APP_URL", "https://copacker.example")
    await shopifySubscribeJob({ orgId: buyerId }, owned)
    expect(shopify.subscribeWebhooks).toHaveBeenCalledWith(
      "https://copacker.example/api/webhooks/shopify",
      shopifyWebhookTopics
    )
    await shopifySubscribeJob({ orgId: otherBuyerId }, owned)
    expect(shopify.subscribeWebhooks).toHaveBeenCalledTimes(1)
  })

  it("skips subscribing when the app isn't reachable over HTTPS", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000")
    await shopifySubscribeJob({ orgId: buyerId }, owned)
    expect(shopify.subscribeWebhooks).not.toHaveBeenCalled()
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
    const line = { id: `gid://shopify/LineItem/${id}`, quantity: 2, currentQuantity: 2, sku, variant: null }
    await database.insert(tables.salesOrders).values({
      orgId,
      source: "shopify",
      externalAccountId: shop,
      orderId: `gid://shopify/Order/${id}`,
      orderedAt: new Date("2026-09-01T10:00:00Z"),
      data: {
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
  const dataRequest = JSON.stringify({
    shop_id: 1,
    shop_domain: shop,
    orders_requested: [1001, 1003],
    customer: { id: 7, email: "customer@example.com", phone: "555-0100" },
    data_request: { id: 42 }
  })

  it("sends workspace owners the stored details of the requested orders, without keeping contact details", async () => {
    await database.insert(tables.memberships).values([
      { orgId: buyerId, userId: "owner", email: "owner@example.com", role: "owner" },
      { orgId: buyerId, userId: "member", email: "member@example.com", role: "member" }
    ])
    await storeOrder(buyerId, 1001, "CORD-2")
    await storeOrder(buyerId, 1002, "MASK-1")
    expect((await webhook(delivery("customers/data_request", dataRequest))).status).toBe(200)
    expect((await webhook(delivery("customers/data_request", dataRequest))).status).toBe(200)
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
    const sent = JSON.parse(String(send.mock.calls[0]![1]!.body)) as { subject: string; text: string }
    expect(sent.subject).toBe(`Customer data request for ${shop}`)
    expect(sent.text).toContain("Order #1001, placed 2026-09-01")
    expect(sent.text).not.toContain("#1002")
  })

  it("acknowledges customer erasure requests, since no customer details are stored", async () => {
    const body = JSON.stringify({ shop_domain: shop, customer: { id: 7 }, orders_to_redact: [1001] })
    expect((await webhook(delivery("customers/redact", body))).status).toBe(200)
    expect(await database.select().from(tables.jobs)).toEqual([])
  })

  it("rejects a signed privacy request it can't read", async () => {
    expect((await webhook(delivery("customers/data_request", "not json"))).status).toBe(400)
    expect((await webhook(delivery("shop/redact", JSON.stringify({ shop_id: 1 })))).status).toBe(400)
  })

  it("erases a removed store's copied data, except in workspaces connected to it again", async () => {
    await storeOrder(buyerId, 1001, "CORD-2")
    await storeOrder(otherBuyerId, 1001, "CORD-2")
    await database.insert(tables.stockSnapshots).values([
      { orgId: buyerId, source: "shopify", externalAccountId: shop, scopeKey: "store" },
      { orgId: otherBuyerId, source: "shopify", externalAccountId: shop, scopeKey: "store" }
    ])
    expect((await webhook(delivery("shop/redact", JSON.stringify({ shop_id: 1, shop_domain: shop })))).status).toBe(200)
    const [job] = await queued("shopify-compliance")
    await shopifyComplianceJob(job!.payload)
    expect((await database.select().from(tables.salesOrders)).map((row) => row.orgId)).toEqual([buyerId])
    expect((await database.select().from(tables.stockSnapshots)).map((row) => row.orgId)).toEqual([buyerId])
  })
})
