import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { orderInputSchema } from "@repo/copacker-shipments"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/workspace-session"
import { applySchema } from "./database"
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
import { multiplyInventoryCost } from "../src/lib/inventory-basis"
import { ApiSessionError } from "../src/server/auth"
import { POST as previewCosts } from "../src/server/http/api/analytics/cost-import-previews"
import { POST as openingRoute } from "../src/server/http/api/analytics/opening-balances"
import { GET as listPurchases, POST as purchaseRoute } from "../src/server/http/api/analytics/purchase-costs"
import { GET as purchaseGet, DELETE as purchaseDelete } from "../src/server/http/api/analytics/purchase-costs/$id"
import { POST as receiptRoute } from "../src/server/http/api/analytics/receipts"
import { DELETE as receiptDelete } from "../src/server/http/api/analytics/receipts/$id"
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

const purchase = {
  kind: "purchase",
  sourceReference: "invoice-1",
  sourceLine: "1",
  occurredAt: "2026-01-01T00:00:00Z",
  evidence: "Invoice and supplier confirmation",
  source: {
    type: "manual",
    shopifyDomain: "store",
    variantId: "v1",
    quantity: 10,
    piecesPerUnit: 2,
    unitCost: { amount: "0.123456", currency: "USD" },
    supplierReference: "supplier-1",
    invoiceReference: "invoice-1",
    batchReference: "batch-1"
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
const receipt = (purchaseId: string, quantity = 4, sourceLine = "1") => ({
  kind: "receipt",
  sourceReference: "delivery-1",
  sourceLine,
  occurredAt: "2026-01-02T00:00:00Z",
  evidence: "Receiving count",
  purchaseId,
  quantity,
  location: "warehouse:A",
  condition: "sellable"
})
const request = (body: unknown, key = randomUUID(), origin = appUrl()) =>
  new Request(`${appUrl()}/api/analytics/purchase-costs`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body)
  })
const resource = (id: string) => ({ params: { id } })
const save = (body: unknown = purchase, key = randomUUID()) => saveInventoryBasis(orgId, `user-${orgId}`, key, body)
beforeAll(async () => {
  context.database = database
  await applySchema(pg)
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
it("preserves exact dated costs and piece-to-sellable-unit basis without changing profit postings", async () => {
  const response = await purchaseRoute(request(purchase))
  expect(response.status).toBe(201)
  const { record } = await response.json()
  expect(response.headers.get("location")).toBe(`/api/analytics/purchase-costs/${record.id}`)
  expect(record).toMatchObject({
    quantity: 10,
    piecesPerUnit: 2,
    occurredAt: new Date(purchase.occurredAt).toISOString(),
    data: {
      costBasis: "actual",
      unitCost: { amount: "0.123456", currency: "USD" },
      totalCost: { amount: "1.23456", currency: "USD" }
    }
  })
  expect(multiplyInventoryCost("999999999999.999999", 1000000000)).toBe("999999999999999999000")
  expect(await database.select().from(tables.amazonTransactions)).toEqual([])
})
it("replays identical requests and rejects duplicate source lines even with fresh keys", async () => {
  const key = randomUUID()
  expect((await purchaseRoute(request(purchase, key))).status).toBe(201)
  expect((await purchaseRoute(request(purchase, key))).status).toBe(200)
  expect((await purchaseRoute(request({ ...purchase, evidence: "Changed" }, key))).status).toBe(409)
  expect((await purchaseRoute(request(purchase))).status).toBe(409)
  expect(await database.select().from(tables.inventoryBasisRecords)).toHaveLength(1)
})
it("keeps unknown opening value distinct from zero and enforces one baseline per location", async () => {
  const unknown = await openingRoute(request(opening))
  expect(unknown.status).toBe(201)
  const { record } = await unknown.json()
  expect(record.data).toMatchObject({ totalCost: null, costBasis: "missing" })
  expect((await openingRoute(request({ ...opening, sourceReference: "another-count" }))).status).toBe(409)
  const corrected = await openingRoute(
    request({
      ...opening,
      supersedes: record.id,
      valuation: { status: "actual", totalCost: { amount: "0", currency: "USD" } }
    })
  )
  expect(corrected.status).toBe(201)
  expect((await corrected.json()).record.data).toMatchObject({ totalCost: { amount: "0" }, costBasis: "actual" })
  expect(
    (
      await openingRoute(
        request({
          ...opening,
          location: "warehouse:B",
          sourceLine: "2",
          quantity: 0,
          valuation: { status: "actual", totalCost: { amount: "10", currency: "USD" } }
        })
      )
    ).status
  ).toBe(400)
})
it("records partial actual receipts and rejects over-receipts, early dates and invalid shipment links", async () => {
  const { record } = await save()
  const first = await receiptRoute(request(receipt(record.id, 4)))
  expect(first.status).toBe(201)
  expect((await first.json()).record.data.totalCost.amount).toBe("0.493824")
  expect((await receiptRoute(request(receipt(record.id, 7, "2")))).status).toBe(409)
  expect(
    (await receiptRoute(request({ ...receipt(record.id, 1, "2"), occurredAt: "2025-01-01T00:00:00Z" }))).status
  ).toBe(422)
  expect((await receiptRoute(request({ ...receipt(record.id, 1, "2"), shipmentId: randomUUID() }))).status).toBe(422)
  expect((await receiptRoute(request(receipt(record.id, 6, "2")))).status).toBe(201)
})
it("serializes competing receipts against the purchase quantity", async () => {
  const { record } = await save()
  const responses = await Promise.all([
    receiptRoute(request(receipt(record.id, 6, "a"))),
    receiptRoute(request(receipt(record.id, 6, "b")))
  ])
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409])
})
it("preserves corrections and blocks purchase changes while active receipts depend on them", async () => {
  const { record } = await save()
  const delivered = await save(receipt(record.id, 4))
  expect((await purchaseDelete(request(null), resource(record.id))).status).toBe(409)
  expect((await purchaseRoute(request({ ...purchase, supersedes: record.id }))).status).toBe(409)
  const revisedReceipt = await save({ ...receipt(record.id, 5), supersedes: delivered.record.id })
  expect(revisedReceipt.record.quantity).toBe(5)
  expect((await receiptDelete(request(null), resource(revisedReceipt.record.id))).status).toBe(204)
  const corrected = await purchaseRoute(
    request({
      ...purchase,
      supersedes: record.id,
      source: { ...purchase.source, unitCost: { amount: "2", currency: "USD" } }
    })
  )
  expect(corrected.status).toBe(201)
  expect((await purchaseRoute(request({ ...purchase, supersedes: record.id }))).status).toBe(409)
  const prior = await purchaseGet(request(null), resource(record.id))
  expect((await prior.json()).record.retiredBy).toBe(`user-${orgId}`)
})
it("protects other workspaces and requires correct permissions, origin and request shape", async () => {
  const { record } = await save()
  context.actor = actor(otherId, "buyer")
  expect((await purchaseGet(request(null), resource(record.id))).status).toBe(404)
  expect((await purchaseDelete(request(null), resource(record.id))).status).toBe(404)
  expect((await receiptRoute(request(receipt(record.id)))).status).toBe(404)
  context.actor = actor(orgId, "buyer")
  expect(
    (
      await purchaseRoute(
        request({ ...purchase, source: { ...purchase.source, shopifyDomain: "secret", variantId: "secret" } })
      )
    ).status
  ).toBe(422)
  expect((await purchaseRoute(request(purchase, randomUUID(), "https://evil.test"))).status).toBe(403)
  expect((await receiptRoute(request(purchase))).status).toBe(400)
  context.actor = { ...actor(orgId, "buyer"), role: "member", access: { products: "view", prices: "view" } }
  expect((await purchaseRoute(request(purchase))).status).toBe(403)
  context.actor = { ...actor(orgId, "buyer"), role: "member", access: { sales: "view" } }
  expect((await listPurchases(request(null))).status).toBe(403)
  context.actor = null
  expect((await listPurchases(request(null))).status).toBe(401)
})
it("supports immutable PO revision snapshots without treating ordered quantities as receipts", async () => {
  const supplierId = randomUUID(),
    orderId = randomUUID(),
    itemId = randomUUID()
  await database.insert(tables.suppliers).values({ id: supplierId, buyerOrgId: orgId, name: "Supplier" })
  const data = orderInputSchema.parse({
    supplierId,
    reference: "PO1",
    destination: "amazon",
    currency: "USD",
    items: [
      {
        id: itemId,
        variantId: "gid://shopify/ProductVariant/1",
        inventoryItemId: "gid://shopify/InventoryItem/1",
        name: "Product",
        variant: "",
        buyerSku: "SKU",
        asin: "",
        fnsku: "",
        pieces: 20,
        piecesPerSet: 2,
        unitPrice: 123,
        supplierCharges: [{ description: "Prep", amount: 50, basis: "piece" }]
      }
    ],
    adjustments: [{ description: "Freight", amount: 500 }]
  })
  await database.insert(tables.orders).values({
    id: orderId,
    buyerOrgId: orgId,
    supplierId,
    shopifyDomain: "historic-store",
    status: "submitted",
    revision: 2,
    data: { ...data, items: data.items.map((item) => ({ ...item, unitPrice: 999 })) }
  })
  await database.insert(tables.orderRevisions).values({ orderId, revision: 1, data, actor: "user", reason: "created" })
  const body = {
    ...purchase,
    source: {
      type: "purchase_order",
      orderId,
      revision: 1,
      itemId,
      invoiceReference: "invoice",
      batchReference: "batch"
    }
  }
  const response = await purchaseRoute(request(body))
  expect(response.status).toBe(201)
  const { record } = await response.json()
  expect(record).toMatchObject({
    quantity: 20,
    piecesPerUnit: 2,
    shopifyDomain: "historic-store",
    data: { costBasis: "estimated", totalCost: { amount: "24.6", currency: "USD" } }
  })
  expect(record.data.purchaseOrder.item.supplierCharges).toHaveLength(1)
  expect(await database.select().from(tables.inventoryBasisRecords)).toHaveLength(1)
  expect((await purchaseRoute(request({ ...body, source: { ...body.source, revision: 2 } }))).status).toBe(409)
  await database
    .update(tables.orders)
    .set({ data: { ...data, currency: "EUR" } })
    .where(eq(tables.orders.id, orderId))
  expect((await (await purchaseGet(request(null), resource(record.id))).json()).record.data.totalCost.currency).toBe(
    "USD"
  )
})
it("paginates history and invalidates continuation after an inventory record changes", async () => {
  const firstResponse = await listPurchases(new Request(`${appUrl()}/api/analytics/purchase-costs`))
  const first = await firstResponse.json()
  expect(first.records).toEqual([])
  await save()
  const stale = await listPurchases(
    new Request(`${appUrl()}/api/analytics/purchase-costs?page=1&snapshot=${first.snapshot}`)
  )
  expect(stale.status).toBe(409)
  expect(await stale.json()).toMatchObject({ code: "snapshot_changed" })
  expect((await listPurchases(new Request(`${appUrl()}/api/analytics/purchase-costs?page=1`))).status).toBe(400)
})
it("rejects future evidence, invalid costs and non-integer quantities", async () => {
  expect((await purchaseRoute(request({ ...purchase, occurredAt: "2099-01-01T00:00:00Z" }))).status).toBe(422)
  for (const amount of ["-1", "NaN", "1e3", "0.1234567"]) {
    expect(
      (
        await purchaseRoute(
          request({ ...purchase, source: { ...purchase.source, unitCost: { amount, currency: "USD" } } })
        )
      ).status
    ).toBe(400)
  }
  expect((await purchaseRoute(request({ ...purchase, source: { ...purchase.source, quantity: 1.5 } }))).status).toBe(
    400
  )
})

it("accepts an explicit zero opening balance and an estimated nonzero balance", async () => {
  const zero = await openingRoute(
    request({ ...opening, quantity: 0, valuation: { status: "actual", totalCost: { amount: "0", currency: "USD" } } })
  )
  expect(zero.status).toBe(201)
  const estimated = await openingRoute(
    request({
      ...opening,
      location: "warehouse:B",
      sourceLine: "2",
      valuation: { status: "estimated", totalCost: { amount: "15.50", currency: "EUR" } }
    })
  )
  expect(estimated.status).toBe(201)
  expect((await estimated.json()).record.data).toMatchObject({
    costBasis: "estimated",
    totalCost: { amount: "15.5", currency: "EUR" }
  })
})
it("keeps a retired record's audit unchanged on repeated deletion and retry", async () => {
  const key = randomUUID()
  const { record } = await save(purchase, key)
  expect((await purchaseDelete(request(null), resource(record.id))).status).toBe(204)
  const before = await (await purchaseGet(request(null), resource(record.id))).json()
  expect((await purchaseDelete(request(null), resource(record.id))).status).toBe(204)
  const replay = await purchaseRoute(request(purchase, key))
  expect(replay.status).toBe(200)
  expect(await replay.json()).toEqual(before)
})
it("isolates draft and foreign purchase order sources", async () => {
  const supplierId = randomUUID(),
    orderId = randomUUID(),
    itemId = randomUUID()
  await database.insert(tables.suppliers).values({ id: supplierId, buyerOrgId: orgId, name: "Supplier" })
  const data = orderInputSchema.parse({
    supplierId,
    reference: "draft",
    destination: "amazon",
    currency: "USD",
    items: [
      {
        id: itemId,
        variantId: "gid://shopify/ProductVariant/1",
        inventoryItemId: "gid://shopify/InventoryItem/1",
        name: "Product",
        variant: "",
        buyerSku: "SKU",
        asin: "",
        fnsku: "",
        pieces: 10,
        piecesPerSet: 1,
        unitPrice: 100
      }
    ]
  })
  await database
    .insert(tables.orders)
    .values({ id: orderId, buyerOrgId: orgId, supplierId, shopifyDomain: "store", status: "draft", data })
  const body = {
    ...purchase,
    source: {
      type: "purchase_order",
      orderId,
      revision: 1,
      itemId,
      invoiceReference: "invoice",
      batchReference: "batch"
    }
  }
  expect((await purchaseRoute(request(body))).status).toBe(404)
  await database.update(tables.orders).set({ status: "submitted" }).where(eq(tables.orders.id, orderId))
  context.actor = actor(otherId, "buyer")
  expect((await purchaseRoute(request(body))).status).toBe(404)
  context.actor = actor(orgId, "buyer")
  expect((await purchaseRoute(request({ ...body, source: { ...body.source, revision: 99 } }))).status).toBe(404)
})

it("protects cost previews with edit access and origin checks without requiring an import key", async () => {
  const body = { rows: [{ id: randomUUID(), kind: "inventory", data: purchase }] }
  const makeRequest = (origin = appUrl(), contentType = "application/json", value = JSON.stringify(body)) =>
    new Request(`${appUrl()}/api/analytics/cost-import-previews`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": contentType },
      body: value
    })
  const response = await previewCosts(makeRequest())
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(response.headers.get("location")).toBeNull()
  expect(await response.json()).toMatchObject({ preview: { count: 1 } })
  expect(await database.select().from(tables.inventoryBasisRecords)).toHaveLength(0)
  expect((await previewCosts(makeRequest("https://evil.test"))).status).toBe(403)
  expect((await previewCosts(makeRequest(appUrl(), "text/plain"))).status).toBe(415)
  expect((await previewCosts(makeRequest(appUrl(), "application/json", "{"))).status).toBe(400)
  context.actor = { ...actor(orgId, "buyer"), role: "member", access: { products: "view", prices: "view" } }
  expect((await previewCosts(makeRequest())).status).toBe(403)
  context.actor = { ...actor(orgId, "buyer"), role: "member", access: { products: "edit" } }
  expect((await previewCosts(makeRequest())).status).toBe(403)
  context.actor = actor(orgId, "supplier")
  expect((await previewCosts(makeRequest())).status).toBe(403)
  context.actor = null
  const denied = await previewCosts(makeRequest())
  expect(denied.status).toBe(401)
  expect(denied.headers.get("content-type")).toContain("application/problem+json")
  expect(await denied.json()).toMatchObject({
    code: "session_required",
    instance: "/api/analytics/cost-import-previews"
  })
})

import { ingestionStatus } from "../src/server/analytics-ingestion"
import { saveUnitMapping } from "../src/server/inventory-unit-mappings"

it("uses historical purchase identity after catalog removal and rejects invented conversion targets", async () => {
  await save()
  await database.delete(tables.variantFields).where(eq(tables.variantFields.orgId, orgId))
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "shopify", externalId: "store", encryptedToken: "test" })
  const mapping = {
    source: "shopify",
    externalAccountId: "store",
    sourceProductId: "v1",
    shopifyDomain: "store",
    variantId: "v1",
    piecesPerUnit: 2,
    automatic: false,
    validFrom: "2026-01-01T00:00:00Z",
    validTo: "2027-01-01T00:00:00Z",
    evidence: "Historical specification"
  }
  await expect(saveUnitMapping(orgId, "owner", randomUUID(), mapping)).resolves.toBeDefined()
  await expect(save(opening)).resolves.toBeDefined()
  await expect(
    saveUnitMapping(orgId, "owner", randomUUID(), { ...mapping, sourceProductId: "missing", variantId: "missing" })
  ).rejects.toMatchObject({ code: "product_not_in_workspace" })
  const status = await ingestionStatus(orgId)
  expect(status.accountingInputs.counts).toEqual(
    expect.arrayContaining([
      { input: "purchase", basis: "actual", count: 1 },
      { input: "opening", basis: "missing", count: 1 }
    ])
  )
  expect((await ingestionStatus(otherId)).accountingInputs.counts).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ input: "purchase" })])
  )
})
