import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/workspace-session"
import { applyMigrations } from "./migrations"
const context = vi.hoisted(() => ({ database: null as unknown, actor: null as Session | null }))
vi.mock("@/db", () => ({ db: () => context.database }))
vi.mock("../src/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => {
    if (!context.actor) {
      throw new ApiSessionError(401)
    }
    return context.actor
  }
}))
import { ApiSessionError } from "../src/server/auth"
import { saveInventoryBasis } from "../src/server/inventory-basis"
import { appUrl } from "../src/server/security"
const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const orgId = randomUUID(),
  otherId = randomUUID()
function actor(id: string, kind: "buyer" | "supplier"): Session {
  return {
    user: { id: `user-${id}`, email: "owner@example.com", emailVerified: true, name: "Olive Owner" },
    org: {
      id,
      kind,
      name: kind,
      workosId: null,
      timeZone: null,
      excludedShopifyTags: ["Amazon"],
      restockSalesDays: null,
      restockLeadTimeDays: null,
      createdAt: new Date()
    },
    role: "owner",
    access: {},
    workspaces: []
  }
}

const opening = {
  kind: "opening",
  sourceReference: "opening-count",
  sourceLine: "1",
  occurredAt: "2026-01-01T00:00:00Z",
  evidence: "Physical opening count",
  shopifyDomain: "store",
  variantId: "v1",
  quantity: 5,
  piecesPerUnit: 2,
  location: "warehouse:A",
  batchReference: null,
  valuation: { status: "unknown" }
}
const request = (body: unknown, key = randomUUID(), origin = appUrl()) =>
  new Request(`${appUrl()}/api/analytics/purchase-costs`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body)
  })
const save = (body: unknown, key = randomUUID()) => saveInventoryBasis(orgId, `user-${orgId}`, key, body)
beforeAll(async () => {
  context.database = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE")
  await database.insert(tables.organizations).values([
    { id: orgId, kind: "buyer", name: "Buyer" },
    { id: otherId, kind: "buyer", name: "Other" }
  ])
  await database.insert(tables.variantFields).values([
    { orgId, shopifyDomain: "store", variantId: "v1" },
    { orgId: otherId, shopifyDomain: "secret", variantId: "secret" }
  ])
  context.actor = actor(orgId, "buyer")
})
import { POST as depletionPost } from "../src/server/http/api/analytics/depletions"
import { GET as listSales } from "../src/server/http/api/analytics/sales-orders"
import { inventoryFifo } from "../src/server/inventory-fifo"
const range = {
  shopifyDomain: "store",
  variantId: "v1",
  location: "shopify:store:loc",
  from: "2026-01-01",
  to: "2026-02-01",
  page: 0
}
async function shopifyOrder() {
  const id = randomUUID()
  const data = {
    id: "order1",
    name: "#1",
    createdAt: "2026-01-01T00:00:00Z",
    cancelledAt: null,
    test: false,
    sourceName: "web",
    tags: [],
    lines: [{ id: "line", quantity: 3, currentQuantity: 3, sku: "SKU", variant: { id: "v1" } }],
    fulfillments: [
      {
        id: "f1",
        status: "SUCCESS",
        location: { id: "loc" },
        lines: [{ id: "fl1", quantity: 3, lineItem: { id: "line" } }]
      }
    ]
  }
  await database.insert(tables.salesOrders).values({
    id,
    orgId,
    source: "shopify",
    externalAccountId: "store",
    orderId: "order1",
    orderedAt: new Date(data.createdAt),
    data
  })
  await database
    .insert(tables.inventoryLocationMappings)
    .values({ orgId, shopifyDomain: "store", locationId: "loc", classification: "merchant" })
  return { id, data }
}
function depletion(salesOrderId: string) {
  return {
    kind: "depletion",
    sourceReference: "shipping-document",
    sourceLine: "1",
    occurredAt: "2026-01-03T00:00:00Z",
    evidence: "Dated shipping manifest; two physical pieces per sellable unit",
    shopifyDomain: "store",
    variantId: "v1",
    quantity: 6,
    piecesPerUnit: 2,
    location: range.location,
    sale: { source: "shopify", salesOrderId, fulfillmentId: "f1", fulfillmentLineId: "fl1" }
  }
}
it("imports Shopify fulfillment pieces once and calculates FIFO from the evidenced shipment date", async () => {
  const order = await shopifyOrder()
  const body = depletion(order.id)
  const key = randomUUID()
  await save({
    ...opening,
    quantity: 10,
    location: range.location,
    valuation: { status: "actual", totalCost: { amount: "20", currency: "USD" } }
  })
  const first = await depletionPost(request(body, key))
  expect(first.status).toBe(201)
  const { record } = await first.json()
  expect(record.data.saleEvidence.units).toBe(3)
  expect((await depletionPost(request(body, key))).status).toBe(200)
  expect((await depletionPost(request({ ...body, sourceReference: "new label" }))).status).toBe(409)
  const result = await inventoryFifo(orgId, range)
  expect(result.rows[0]?.cogs).toEqual({ amount: "12", currency: "USD" })
  expect(result.endingQuantity).toBe(4)
})
it("blocks stale imported evidence after an order refresh and allows audited correction", async () => {
  const order = await shopifyOrder()
  const body = depletion(order.id)
  await save({
    ...opening,
    quantity: 10,
    location: range.location,
    valuation: { status: "actual", totalCost: { amount: "20", currency: "USD" } }
  })
  const { record } = await (await depletionPost(request(body))).json()
  order.data.fulfillments[0]!.lines[0]!.quantity = 2
  await database.update(tables.salesOrders).set({ data: order.data }).where(eq(tables.salesOrders.id, order.id))
  await expect(inventoryFifo(orgId, range)).rejects.toMatchObject({ code: "sale_evidence_changed" })
  expect((await depletionPost(request({ ...body, quantity: 4, supersedes: record.id }))).status).toBe(201)
  expect((await inventoryFifo(orgId, range)).rows[0]?.cogs).toEqual({ amount: "8", currency: "USD" })
})
it("rejects wrong products, pieces, dates, locations and foreign source IDs", async () => {
  const order = await shopifyOrder()
  const body = depletion(order.id)
  for (const change of [
    { quantity: 3 },
    { variantId: "wrong" },
    { location: "default" },
    { occurredAt: "2025-12-31T00:00:00Z" }
  ]) {
    expect((await depletionPost(request({ ...body, ...change }))).status).toBe(422)
  }
  context.actor = actor(otherId, "buyer")
  expect((await depletionPost(request(body))).status).toBe(404)
})
it("excludes mirrored stock and imported channels instead of double counting marketplace orders", async () => {
  const order = await shopifyOrder()
  const body = depletion(order.id)
  await database.update(tables.inventoryLocationMappings).set({ classification: "amazon_mirror" })
  expect((await depletionPost(request(body))).status).toBe(422)
  await database.update(tables.inventoryLocationMappings).set({ classification: "merchant" })
  order.data.sourceName = "amazon"
  await database.update(tables.salesOrders).set({ data: order.data })
  expect((await depletionPost(request(body))).status).toBe(422)
})
async function amazonOrder() {
  const id = randomUUID()
  const data = {
    orderId: "amazon1",
    createdTime: "2026-01-01T00:00:00Z",
    salesChannel: { channelName: "AMAZON", marketplaceId: "ATVPDKIKX0DER" },
    fulfillment: { fulfillmentStatus: "SHIPPED", fulfilledBy: "AMAZON" },
    orderItems: [
      {
        orderItemId: "item1",
        quantityOrdered: 3,
        product: { sellerSku: "SKU", asin: "ASIN" },
        fulfillment: { quantityFulfilled: 3, quantityUnfulfilled: 0 }
      }
    ]
  }
  await database.insert(tables.salesOrders).values({
    id,
    orgId,
    source: "amazon",
    externalAccountId: "seller",
    orderId: "amazon1",
    orderedAt: new Date(data.createdTime),
    data
  })
  const mappingId = randomUUID()
  await database.insert(tables.amazonProductMappings).values({
    id: mappingId,
    orgId,
    externalAccountId: "seller",
    marketplaceId: "ATVPDKIKX0DER",
    sku: "SKU",
    asin: "ASIN",
    shopifyDomain: "store",
    variantId: "v1",
    validFrom: new Date("2026-01-01"),
    validTo: new Date("2026-02-01"),
    evidence: "Historical listing",
    createdBy: "user"
  })
  return { id, mappingId, data }
}
function amazonDepletion(id: string, units = 2, shipmentReference = "shipment1") {
  return {
    ...depletion(id),
    location: "amazon:seller:US:FBA",
    quantity: units * 2,
    sale: { source: "amazon", salesOrderId: id, orderItemId: "item1", shipmentReference, units }
  }
}
it("imports split Amazon shipments with dated identity and caps their combined units", async () => {
  const order = await amazonOrder()
  expect((await depletionPost(request(amazonDepletion(order.id)))).status).toBe(201)
  expect((await depletionPost(request(amazonDepletion(order.id, 2, "shipment2")))).status).toBe(409)
  expect((await depletionPost(request(amazonDepletion(order.id, 1, "shipment2")))).status).toBe(201)
  expect((await depletionPost(request(amazonDepletion(order.id, 1, "shipment3")))).status).toBe(409)
})
it("requires current unique mappings and rejects FBM or unsupported stock pools", async () => {
  const order = await amazonOrder()
  await database.update(tables.amazonProductMappings).set({ retiredAt: new Date() })
  expect((await depletionPost(request(amazonDepletion(order.id)))).status).toBe(422)
  await database.update(tables.amazonProductMappings).set({ retiredAt: null })
  order.data.fulfillment.fulfilledBy = "MERCHANT"
  await database.update(tables.salesOrders).set({ data: order.data })
  expect((await depletionPost(request(amazonDepletion(order.id)))).status).toBe(422)
})
it("exposes scoped sales evidence and invalidates pagination after order changes", async () => {
  const order = await shopifyOrder()
  const url = `${appUrl()}/api/analytics/sales-orders?source=shopify&externalAccountId=store&from=2026-01-01&to=2026-02-01`
  const first = await listSales(new Request(url))
  expect(first.status).toBe(200)
  const body = await first.json()
  expect(body.orders[0].id).toBe(order.id)
  await database.update(tables.salesOrders).set({ syncedAt: new Date() })
  expect((await listSales(new Request(`${url}&page=1&snapshot=${body.snapshot}`))).status).toBe(409)
  context.actor = actor(otherId, "buyer")
  expect((await (await listSales(new Request(url))).json()).orders).toEqual([])
})

it("blocks FIFO when a previously imported Amazon mapping is retired", async () => {
  const order = await amazonOrder()
  const location = "amazon:seller:US:FBA"
  await save({
    ...opening,
    location,
    quantity: 10,
    valuation: { status: "actual", totalCost: { amount: "20", currency: "USD" } }
  })
  expect((await depletionPost(request(amazonDepletion(order.id)))).status).toBe(201)
  expect((await inventoryFifo(orgId, { ...range, location })).rows[0]?.cogs).toEqual({ amount: "8", currency: "USD" })
  await database
    .update(tables.amazonProductMappings)
    .set({ retiredAt: new Date() })
    .where(eq(tables.amazonProductMappings.id, order.mappingId))
  await expect(inventoryFifo(orgId, { ...range, location })).rejects.toMatchObject({ code: "sale_evidence_changed" })
})
it("blocks FIFO when merchant stock is reclassified after import", async () => {
  const order = await shopifyOrder()
  await save({ ...opening, location: range.location, quantity: 10 })
  expect((await depletionPost(request(depletion(order.id)))).status).toBe(201)
  await database.update(tables.inventoryLocationMappings).set({ classification: "amazon_mirror" })
  await expect(inventoryFifo(orgId, range)).rejects.toMatchObject({ code: "sale_evidence_changed" })
})

it("uses Shopify in-transit time without treating fulfillment creation as shipment time", async () => {
  const order = await shopifyOrder()
  const original = order.data.fulfillments[0]!
  await database.update(tables.salesOrders).set({
    data: {
      ...order.data,
      fulfillments: [{ ...original, createdAt: "2026-01-02T00:00:00Z", inTransitAt: "2026-01-04T00:00:00Z" }]
    }
  })
  const body = { ...depletion(order.id), occurredAt: undefined }
  const key = randomUUID()
  const response = await depletionPost(request(body, key))
  expect(response.status).toBe(201)
  expect((await response.json()).record.occurredAt).toBe("2026-01-04T00:00:00.000Z")
  expect((await depletionPost(request(body, key))).status).toBe(200)
  expect((await depletionPost(request(depletion(order.id)))).status).toBe(422)
})
it("requires dated evidence when Shopify has no in-transit timestamp", async () => {
  const order = await shopifyOrder()
  await database.update(tables.salesOrders).set({
    data: {
      ...order.data,
      fulfillments: order.data.fulfillments.map((row) => ({
        ...row,
        createdAt: "2026-01-02T00:00:00Z",
        inTransitAt: null
      }))
    }
  })
  expect((await depletionPost(request({ ...depletion(order.id), occurredAt: undefined }))).status).toBe(422)
})
it("uses matched Amazon shipment dates and rejects quantity or date mismatches", async () => {
  const order = await amazonOrder()
  await database.insert(tables.amazonFulfillmentShipments).values({
    orgId,
    externalAccountId: "seller",
    marketplaceId: "ATVPDKIKX0DER",
    shipmentId: "shipment1",
    shipmentItemId: "SI1",
    orderId: "amazon1",
    orderItemId: "item1",
    shippedAt: new Date("2026-01-04"),
    sku: "SKU",
    quantity: 2,
    fulfillmentChannel: "AFN",
    salesChannel: "Amazon.com"
  })
  const original = amazonDepletion(order.id)
  const body = { ...original, occurredAt: undefined, sale: { ...original.sale, shipmentItemId: "SI1" } }
  const response = await depletionPost(request(body))
  expect(response.status).toBe(201)
  expect((await response.json()).record.occurredAt).toBe("2026-01-04T00:00:00.000Z")
  expect((await depletionPost(request({ ...body, occurredAt: "2026-01-03T00:00:00Z" }))).status).toBe(422)
  expect((await depletionPost(request({ ...body, quantity: 2, sale: { ...body.sale, units: 1 } }))).status).toBe(422)
})

it("lists scoped shipment evidence and keeps unchanged report refreshes valid for FIFO", async () => {
  const order = await amazonOrder()
  const location = "amazon:seller:US:FBA"
  await save({
    ...opening,
    location,
    quantity: 10,
    valuation: { status: "actual", totalCost: { amount: "20", currency: "USD" } }
  })
  await database.insert(tables.amazonFulfillmentShipments).values({
    orgId,
    externalAccountId: "seller",
    marketplaceId: "ATVPDKIKX0DER",
    shipmentId: "shipment1",
    shipmentItemId: "SI1",
    orderId: "amazon1",
    orderItemId: "item1",
    shippedAt: new Date("2026-01-04"),
    sku: "SKU",
    quantity: 2,
    fulfillmentChannel: "AFN",
    salesChannel: "Amazon.com"
  })
  const { GET } = await import("../src/server/http/api/analytics/amazon/fulfillment-shipments")
  const url = `${appUrl()}/api/analytics/amazon/fulfillment-shipments?externalAccountId=seller&from=2026-01-01&to=2026-02-01`
  const response = await GET(new Request(url))
  expect(response.status).toBe(200)
  expect((await response.json()).shipments).toHaveLength(1)
  const original = amazonDepletion(order.id)
  expect(
    (
      await depletionPost(
        request({ ...original, occurredAt: undefined, sale: { ...original.sale, shipmentItemId: "SI1" } })
      )
    ).status
  ).toBe(201)
  await database.update(tables.amazonFulfillmentShipments).set({ importedAt: new Date() })
  expect((await inventoryFifo(orgId, { ...range, location })).rows[0]?.cogs).toEqual({ amount: "8", currency: "USD" })
  await database.update(tables.amazonFulfillmentShipments).set({ shippedAt: new Date("2026-01-05") })
  await expect(inventoryFifo(orgId, { ...range, location })).rejects.toMatchObject({ code: "sale_evidence_changed" })
  context.actor = actor(otherId, "buyer")
  expect((await (await GET(new Request(url))).json()).shipments).toEqual([])
})
