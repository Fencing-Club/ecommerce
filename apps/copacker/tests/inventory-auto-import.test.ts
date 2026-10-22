import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { beforeEach, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { database, setUpTestDatabase } from "./test-db"
import { signedIn, testSession } from "./test-session"
vi.mock("@/db", () => import("./test-db"))
vi.mock("../src/server/auth", async (original) => (await import("./test-session")).mockAuth(original))
import { saveInventoryBasis } from "../src/server/inventory-basis"
import { appUrl } from "../src/server/security"
const orgId = randomUUID(),
  otherId = randomUUID()

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
setUpTestDatabase({ truncate: true })
beforeEach(async () => {
  await database.insert(tables.organizations).values([
    { id: orgId, kind: "buyer", name: "Buyer" },
    { id: otherId, kind: "buyer", name: "Other" }
  ])
  await database.insert(tables.variantFields).values([
    { orgId, shopifyDomain: "store", variantId: "v1" },
    { orgId: otherId, shopifyDomain: "secret", variantId: "secret" }
  ])
  signedIn.actor = testSession({ orgId, kind: "buyer" })
})
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
    transactions: [],
    id: "order1",
    name: "#1",
    createdAt: "2026-01-01T00:00:00Z",
    cancelledAt: null,
    test: false,
    sourceName: "web",
    tags: [],
    lines: [
      {
        originalUnitPriceSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
        discountAllocations: [],
        id: "line",
        quantity: 3,
        currentQuantity: 3,
        sku: "SKU",
        variant: { id: "v1" }
      }
    ],
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
import { GET as importList } from "../src/server/http/api/analytics/depletion-imports"
import { POST as mappingPost, GET as mappingList } from "../src/server/http/api/analytics/unit-mappings"
import { DELETE as mappingDelete, GET as mappingGet } from "../src/server/http/api/analytics/unit-mappings/$id"
import { syncAutomaticDepletions, listImportResults } from "../src/server/inventory-auto-import"
import { retireInventoryBasis } from "../src/server/inventory-basis"
import { saveUnitMapping, retireUnitMapping } from "../src/server/inventory-unit-mappings"
const mappingBody = {
  source: "shopify",
  externalAccountId: "store",
  sourceProductId: "v1",
  shopifyDomain: "store",
  variantId: "v1",
  piecesPerUnit: 2,
  automatic: true,
  validFrom: "2026-01-01T00:00:00Z",
  validTo: "2026-02-01T00:00:00Z",
  evidence: "Historical pack specification"
}
async function configure() {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "shopify", externalId: "store", encryptedToken: "test" })
  const order = await shopifyOrder()
  await database
    .update(tables.salesOrders)
    .set({
      data: {
        ...order.data,
        fulfillments: order.data.fulfillments.map((f) => ({ ...f, inTransitAt: "2026-01-03T00:00:00Z" }))
      }
    })
    .where(eq(tables.salesOrders.id, order.id))
  await save({
    ...opening,
    location: range.location,
    quantity: 100,
    valuation: { status: "actual", totalCost: { amount: "200", currency: "USD" } }
  })
  const { mapping } = await saveUnitMapping(orgId, "owner", randomUUID(), mappingBody)
  return { order, mapping }
}
const results = () => listImportResults(orgId, { source: "shopify", externalAccountId: "store", page: 0 })
it("imports evidenced pieces automatically and reruns without duplication", async () => {
  await configure()
  await syncAutomaticDepletions(orgId, "shopify", "store")
  expect((await results()).results[0]).toMatchObject({ status: "processed", createdCount: 1 })
  expect((await inventoryFifo(orgId, range)).rows[0]?.cogs).toEqual({ amount: "12", currency: "USD" })
  await syncAutomaticDepletions(orgId, "shopify", "store")
  expect((await results()).results[0]).toMatchObject({ status: "processed", createdCount: 0, unchangedCount: 1 })
  expect(
    (await database.select().from(tables.inventoryBasisRecords)).filter((row) => row.kind === "depletion")
  ).toHaveLength(1)
})
it("restates automatic records with audited revisions when order evidence changes", async () => {
  const { order } = await configure()
  await syncAutomaticDepletions(orgId, "shopify", "store")
  await database.update(tables.salesOrders).set({
    data: {
      ...order.data,
      fulfillments: order.data.fulfillments.map((f) => ({
        ...f,
        inTransitAt: "2026-01-03T00:00:00Z",
        lines: f.lines.map((line) => ({ ...line, quantity: 2 }))
      }))
    }
  })
  await expect(inventoryFifo(orgId, range)).rejects.toMatchObject({ code: "sale_evidence_changed" })
  await syncAutomaticDepletions(orgId, "shopify", "store")
  const depletions = (await database.select().from(tables.inventoryBasisRecords)).filter(
    (row) => row.kind === "depletion"
  )
  expect(depletions).toHaveLength(2)
  expect(depletions.filter((row) => row.retiredAt)).toHaveLength(1)
  expect((await inventoryFifo(orgId, range)).rows[0]?.cogs).toEqual({ amount: "8", currency: "USD" })
})
it("rejects overlap, allows adjacent periods, and enforces idempotent mapping writes", async () => {
  const { mapping } = await configure()
  expect((await mappingPost(request(mappingBody))).status).toBe(409)
  const body = { ...mappingBody, validFrom: mappingBody.validTo, validTo: "2026-03-01T00:00:00Z" },
    key = randomUUID()
  expect((await mappingPost(request(body, key))).status).toBe(201)
  expect((await mappingPost(request(body, key))).status).toBe(200)
  expect((await mappingPost(request({ ...body, piecesPerUnit: 3 }, key))).status).toBe(409)
  expect((await mappingGet(request(null), { params: { id: mapping.id } })).status).toBe(200)
  signedIn.actor = testSession({ orgId: otherId, kind: "buyer" })
  expect((await mappingDelete(request(null), { params: { id: mapping.id } })).status).toBe(404)
  expect((await mappingGet(request(null), { params: { id: mapping.id } })).status).toBe(404)
})
it("mapping retirement blocks historical FIFO and an explicit correction permits recalculation", async () => {
  const { mapping } = await configure()
  await syncAutomaticDepletions(orgId, "shopify", "store")
  await retireUnitMapping(orgId, "owner", mapping.id)
  await expect(inventoryFifo(orgId, range)).rejects.toMatchObject({ code: "sale_evidence_changed" })
  await saveUnitMapping(orgId, "owner", randomUUID(), { ...mappingBody, piecesPerUnit: 3 })
  await syncAutomaticDepletions(orgId, "shopify", "store")
  expect((await inventoryFifo(orgId, range)).rows[0]?.cogs).toEqual({ amount: "18", currency: "USD" })
})
it("keeps missing dates and missing opening balances as actionable gaps", async () => {
  const { order } = await configure()
  await database.update(tables.salesOrders).set({ data: order.data })
  await syncAutomaticDepletions(orgId, "shopify", "store")
  expect((await results()).results[0]?.gaps).toContainEqual({ code: "shipment_date_required", eventId: '["f1","fl1"]' })
  await database.update(tables.salesOrders).set({
    data: {
      ...order.data,
      fulfillments: order.data.fulfillments.map((f) => ({ ...f, inTransitAt: "2026-01-03T00:00:00Z" }))
    }
  })
  await database.delete(tables.inventoryBasisRecords)
  await syncAutomaticDepletions(orgId, "shopify", "store")
  expect((await results()).results[0]?.gaps).toContainEqual({ code: "opening_required", eventId: '["f1","fl1"]' })
})
it("does not recreate retired automatic depletion or duplicate unlinked manual stock movements", async () => {
  await configure()
  await syncAutomaticDepletions(orgId, "shopify", "store")
  const records = await database.select().from(tables.inventoryBasisRecords)
  const depletion = records.find((row) => row.kind === "depletion")!
  await retireInventoryBasis(orgId, "owner", "depletion", depletion.id)
  await syncAutomaticDepletions(orgId, "shopify", "store")
  expect((await results()).results[0]?.gaps.some((g) => g.code === "retired_depletion_requires_review")).toBe(true)
  await save({
    kind: "depletion",
    sourceReference: "manual-sale",
    sourceLine: "1",
    occurredAt: "2026-01-03T00:00:00Z",
    evidence: "Manual shipment",
    shopifyDomain: "store",
    variantId: "v1",
    quantity: 1,
    piecesPerUnit: 1,
    location: range.location
  })
  await syncAutomaticDepletions(orgId, "shopify", "store")
  expect((await results()).results[0]?.gaps.some((g) => g.code === "manual_depletion_reconciliation_required")).toBe(
    true
  )
})
it("requires opt-in and never imports another workspace or replaced account", async () => {
  const { mapping } = await configure()
  await saveUnitMapping(orgId, "owner", randomUUID(), { ...mappingBody, automatic: false, supersedes: mapping.id })
  expect(await syncAutomaticDepletions(orgId, "shopify", "store")).toMatchObject({ processedOrders: 0 })
  expect(await syncAutomaticDepletions(otherId, "shopify", "store")).toMatchObject({ processedOrders: 0 })
  expect(await syncAutomaticDepletions(orgId, "shopify", "replacement")).toMatchObject({ processedOrders: 0 })
})
it("imports matched US FBA shipments with the dated SKU conversion", async () => {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId: "seller", encryptedToken: "test" })
  const order = await amazonOrder()
  await saveUnitMapping(orgId, "owner", randomUUID(), {
    ...mappingBody,
    source: "amazon",
    externalAccountId: "seller",
    sourceProductId: "SKU"
  })
  const location = "amazon:seller:US:FBA"
  await save({
    ...opening,
    location,
    quantity: 20,
    valuation: { status: "actual", totalCost: { amount: "40", currency: "USD" } }
  })
  await database.insert(tables.amazonFulfillmentShipments).values({
    orgId,
    externalAccountId: "seller",
    marketplaceId: "ATVPDKIKX0DER",
    shipmentId: "shipment1",
    shipmentItemId: "SI1",
    orderId: order.data.orderId,
    orderItemId: "item1",
    shippedAt: new Date("2026-01-03"),
    sku: "SKU",
    quantity: 2,
    fulfillmentChannel: "AFN",
    salesChannel: "Amazon.com"
  })
  await syncAutomaticDepletions(orgId, "amazon", "seller")
  expect((await inventoryFifo(orgId, { ...range, location })).rows[0]?.cogs).toEqual({ amount: "8", currency: "USD" })
})
it("scopes and paginates import status and mapping history", async () => {
  await configure()
  await syncAutomaticDepletions(orgId, "shopify", "store")
  const url = `${appUrl()}/api/analytics/depletion-imports?source=shopify&externalAccountId=store`
  expect((await (await importList(new Request(url))).json()).results).toHaveLength(1)
  expect(
    (await (await mappingList(new Request(`${appUrl()}/api/analytics/unit-mappings`))).json()).mappings
  ).toHaveLength(1)
  signedIn.actor = testSession({ orgId: otherId, kind: "buyer" })
  expect((await (await importList(new Request(url))).json()).results).toEqual([])
})

it("excludes eBay-tagged Shopify copies from automatic depletion even with a web source", async () => {
  const { order } = await configure()
  await database
    .update(tables.salesOrders)
    .set({
      data: {
        ...order.data,
        tags: ["eBaY"],
        fulfillments: order.data.fulfillments.map((f) => ({ ...f, inTransitAt: "2026-01-03T00:00:00Z" }))
      }
    })
    .where(eq(tables.salesOrders.id, order.id))
  await syncAutomaticDepletions(orgId, "shopify", "store")
  expect((await results()).results[0]?.gaps).toContainEqual({ code: "sale_excluded", eventId: '["f1","fl1"]' })
  expect(
    (await database.select().from(tables.inventoryBasisRecords)).filter((row) => row.kind === "depletion")
  ).toHaveLength(0)
})
