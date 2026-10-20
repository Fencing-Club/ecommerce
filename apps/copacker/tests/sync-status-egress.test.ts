import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { ShopifySale } from "@repo/aisle/sales"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/workspace-session"

const context = vi.hoisted(() => ({ current: null as unknown, actor: null as Session | null }))
vi.mock("@/db", () => ({ db: () => context.current }))
vi.mock("../src/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => context.actor
}))
import { GET as inventory } from "../src/server/http/api/inventory"
import { GET as status } from "../src/server/http/api/inventory/status"
import { salesSyncStatus } from "../src/server/sales-orders"
import { applySchema } from "./database"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const orgId = randomUUID()
const domain = "status-test.myshopify.com"
const observedAt = "2026-10-16T10:00:00.000Z"
beforeAll(async () => {
  context.current = database
  await applySchema(pg)
})
afterAll(async () => pg.close())
beforeEach(async () => {
  vi.restoreAllMocks()
  await pg.exec("TRUNCATE organizations CASCADE")
  const [org] = await database
    .insert(tables.organizations)
    .values({ id: orgId, name: "Buyer", kind: "buyer" })
    .returning()
  context.actor = {
    user: { id: "user-test", email: "test@example.com", emailVerified: true, name: "Test" },
    org: org!,
    role: "owner",
    access: {},
    workspaces: []
  }
  await database.insert(tables.connections).values({
    orgId,
    provider: "shopify",
    externalId: domain,
    encryptedToken: "unused"
  })
})

const request = (query = "source=shopify") => new Request(`http://localhost/api/inventory/status?${query}`)

it("keeps inventory status database results small as the catalog grows", async () => {
  await database.insert(tables.stockSnapshots).values({
    orgId,
    externalAccountId: domain,
    source: "shopify",
    scopeKey: "store",
    status: "failed",
    errorCode: "reconnect",
    snapshotId: randomUUID(),
    data: {
      source: "shopify",
      scopeKey: "store",
      shopifyDomain: domain,
      startedAt: observedAt,
      observedAt,
      rows: Array.from({ length: 1000 }, (_, index) => ({
        variantId: `gid://shopify/ProductVariant/${index}`,
        inventoryItemId: `gid://shopify/InventoryItem/${index}`,
        buyerSku: `SKU-${index}`,
        productId: `gid://shopify/Product/${index}`,
        productTitle: "A product with a title",
        variantTitle: "Default Title",
        imageUrl: null,
        tracked: true,
        unit: "shopify_inventory_unit",
        levels: []
      }))
    }
  })
  const reads = vi.spyOn(pg, "query")
  const old = await inventory(new Request("http://localhost/api/inventory?source=shopify&limit=1"))
  const before = Buffer.byteLength(JSON.stringify(await Promise.all(reads.mock.results.map((result) => result.value))))
  reads.mockClear()
  const response = await status(request())
  const after = Buffer.byteLength(JSON.stringify(await Promise.all(reads.mock.results.map((result) => result.value))))
  const full = await old.json()
  expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  expect(await response.json()).toEqual({
    externalAccountId: full.externalAccountId,
    observedAt: full.observedAt,
    refresh: { status: full.refresh.status, errorCode: full.refresh.errorCode }
  })
  expect(after).toBeLessThan(1000)
  expect(after).toBeLessThan(before / 100)
  process.stdout.write(`${JSON.stringify({ benchmark: "inventory-status", rows: 1000, before, after })}\n`)
})

it("isolates the connected account, workspace and stock scope", async () => {
  await database.insert(tables.stockSnapshots).values({
    orgId,
    externalAccountId: "previous.myshopify.com",
    source: "shopify",
    scopeKey: "store",
    status: "running"
  })
  expect(await (await status(request())).json()).toEqual({
    externalAccountId: domain,
    observedAt: null,
    refresh: { status: "idle", errorCode: null }
  })
  const [other] = await database.insert(tables.organizations).values({ name: "Other", kind: "buyer" }).returning()
  context.actor = { ...context.actor!, org: other! }
  expect(await (await status(request())).json()).toEqual({
    externalAccountId: null,
    observedAt: null,
    refresh: { status: "idle", errorCode: "not_connected" }
  })
  context.actor = { ...context.actor, org: { ...other!, kind: "supplier" } }
  expect((await status(request())).status).toBe(403)
})

it.each([
  "source=shopify&source=awd",
  "source=fba",
  "source=awd&marketplaceId=ATVPDKIKX0DER",
  "source=shopify&limit=1",
  "source=unknown"
])("rejects invalid status selection %s", async (query) => {
  expect((await status(request(query))).status).toBe(400)
})

it("aggregates recent sales without transferring orders, counting each bundle once", async () => {
  const data: ShopifySale = {
    transactions: [],
    id: "gid://shopify/Order/1",
    name: "#1",
    createdAt: observedAt,
    cancelledAt: null,
    test: false,
    sourceName: "web",
    fulfillments: [],
    tags: [],
    lines: [
      {
        originalUnitPriceSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
        discountAllocations: [],
        id: "l1",
        sku: "A",
        quantity: 3,
        currentQuantity: 2,
        variant: { id: "v1" }
      },
      ...["l2", "l3"].map((id) => ({
        originalUnitPriceSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
        discountAllocations: [],
        id,
        sku: "B",
        quantity: 4,
        currentQuantity: 4,
        variant: { id },
        lineItemGroup: { id: "bundle", variantId: "vb", quantity: 4 }
      }))
    ]
  }
  await database.insert(tables.salesOrders).values(
    Array.from({ length: 200 }, (_, index) => ({
      orgId,
      source: "shopify" as const,
      externalAccountId: domain,
      orderId: `order-${index}`,
      orderedAt: new Date(observedAt),
      data: { ...data, name: `#${index}` }
    }))
  )
  // Neither a cancelled order, an excluded tag, today's order nor a previous account changes recent totals.
  await database.insert(tables.salesOrders).values(
    [
      { orderId: "cancelled", data: { ...data, cancelledAt: observedAt } },
      { orderId: "excluded", data: { ...data, tags: ["Amazon"] } },
      { orderId: "today", data, orderedAt: new Date("2026-10-17T08:00:00Z") },
      { orderId: "old-account", data, externalAccountId: "previous.myshopify.com" }
    ].map((row) => ({
      orgId,
      source: "shopify" as const,
      externalAccountId: domain,
      orderedAt: new Date(observedAt),
      ...row
    }))
  )
  await database
    .update(tables.organizations)
    .set({ excludedShopifyTags: ["Amazon"] })
    .where(eq(tables.organizations.id, orgId))
  const before = Buffer.byteLength(JSON.stringify(await database.select().from(tables.salesOrders)))
  const reads = vi.spyOn(pg, "query")
  const result = await salesSyncStatus(orgId, "America/Los_Angeles", new Date("2026-10-17T12:00:00Z"))
  const after = Buffer.byteLength(JSON.stringify(await Promise.all(reads.mock.results.map((row) => row.value))))
  expect(result).toMatchObject([{ source: "shopify", externalAccountId: domain, recent: { orders: 200, units: 1200 } }])
  expect(after).toBeLessThan(3000)
  expect(after).toBeLessThan(before / 50)
  process.stdout.write(`${JSON.stringify({ benchmark: "sales-status", rows: 200, before, after })}\n`)
})
