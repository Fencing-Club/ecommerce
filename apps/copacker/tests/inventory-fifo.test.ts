import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { orderInputSchema } from "@repo/aisle"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/auth"
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
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn<() => void>() }))
import { DELETE as purchaseDelete } from "../src/app/api/analytics/purchase-costs/[id]/route"
import { POST as purchaseRoute } from "../src/app/api/analytics/purchase-costs/route"
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
const resource = (id: string) => ({ params: Promise.resolve({ id }) })
const save = (body: unknown = purchase, key = randomUUID()) => saveInventoryBasis(orgId, `user-${orgId}`, key, body)
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
import { POST as depletionPost } from "../src/app/api/analytics/depletions/route"
import { GET as fifoGet } from "../src/app/api/analytics/fifo/route"
import { DELETE as landedDelete, GET as landedGet } from "../src/app/api/analytics/landed-charges/[id]/route"
import { POST as landedPost, GET as landedList } from "../src/app/api/analytics/landed-charges/route"
import { inventoryMicros } from "../src/lib/inventory-money"
import { allocateLandedCharge } from "../src/lib/landed-allocation"
import { inventoryFifo } from "../src/server/inventory-fifo"
const range = {
  shopifyDomain: "store",
  variantId: "v1",
  location: "warehouse:A",
  from: "2026-01-01",
  to: "2026-02-01",
  page: 0
}
const depletion = (quantity: number, day = "2026-01-03", line = "1") => ({
  kind: "depletion",
  shopifyDomain: "store",
  variantId: "v1",
  location: "warehouse:A",
  piecesPerUnit: 2,
  quantity,
  occurredAt: `${day}T00:00:00Z`,
  sourceReference: "sale",
  sourceLine: line,
  evidence: "Confirmed sold pieces"
})
const bill = (ids: string[], amount = "10", basis: "pieces" | "purchase_value" | "manual" = "pieces") => ({
  sourceReference: "freight-bill",
  sourceLine: "1",
  occurredAt: "2026-02-03T00:00:00Z",
  category: "freight",
  costBasis: "actual",
  amount,
  currency: "USD",
  basis,
  evidence: "Carrier invoice",
  targets: ids.map((purchaseId) => ({ purchaseId }))
})
async function zeroOpening() {
  return save({ ...opening, quantity: 0, valuation: { status: "actual", totalCost: { amount: "0", currency: "USD" } } })
}
async function purchased(quantity = 10, amount = "2", line = "1", currency = "USD") {
  return save({
    ...purchase,
    sourceLine: line,
    source: { ...purchase.source, quantity, unitCost: { amount, currency } }
  })
}
it("allocates signed bills with deterministic rounding and exact conservation", () => {
  const targets = [
    { purchaseId: "a", weight: 1n },
    { purchaseId: "b", weight: 1n },
    { purchaseId: "c", weight: 1n }
  ]
  expect(allocateLandedCharge("0.000002", targets)).toEqual([
    { purchaseId: "a", amount: "0.000001" },
    { purchaseId: "b", amount: "0.000001" },
    { purchaseId: "c", amount: "0" }
  ])
  expect(allocateLandedCharge("-0.000002", targets)).toEqual([
    { purchaseId: "a", amount: "-0.000001" },
    { purchaseId: "b", amount: "-0.000001" },
    { purchaseId: "c", amount: "0" }
  ])
  for (const amount of ["0", "1.234567", "999999999999.999999"]) {
    expect(allocateLandedCharge(amount, targets).reduce((sum, row) => sum + inventoryMicros(row.amount), 0n)).toBe(
      inventoryMicros(amount)
    )
  }
})
it("calculates FIFO COGS from opening stock then landed receipt lots and conserves remaining value", async () => {
  await save({ ...opening, quantity: 2, valuation: { status: "actual", totalCost: { amount: "2", currency: "USD" } } })
  const purchase = await purchased(10, "2")
  await save(receipt(purchase.record.id, 10))
  expect((await landedPost(request(bill([purchase.record.id])))).status).toBe(201)
  expect((await depletionPost(request(depletion(5)))).status).toBe(201)
  const result = await inventoryFifo(orgId, range)
  expect(result.rows[0]).toMatchObject({
    quantity: 5,
    status: "valued",
    cogs: { currency: "USD", amount: "11" },
    allocations: [
      { quantity: 2, amount: "2" },
      { quantity: 3, amount: "9" }
    ]
  })
  expect(result.endingQuantity).toBe(7)
  expect(result.knownEndingValues).toEqual([{ currency: "USD", amount: "21" }])
  expect(result.purchases[0]).toMatchObject({ landedValue: "30", unreceivedValue: "0" })
})
it("restates sold and remaining costs after late-bill corrections without creating financial postings", async () => {
  await zeroOpening()
  const purchase = await purchased()
  await save(receipt(purchase.record.id, 10))
  await save(depletion(4))
  const original = await landedPost(request(bill([purchase.record.id])))
  const { charge } = await original.json()
  const first = await inventoryFifo(orgId, range)
  expect(first.rows[0]?.cogs?.amount).toBe("12")
  expect((await landedPost(request({ ...bill([purchase.record.id], "20"), supersedes: charge.id }))).status).toBe(201)
  const updated = await inventoryFifo(orgId, range)
  expect(updated.rows[0]?.cogs?.amount).toBe("16")
  expect(updated.knownEndingValues).toEqual([{ currency: "USD", amount: "24" }])
  expect(updated.snapshot).not.toBe(first.snapshot)
  expect(await database.select().from(tables.amazonTransactions)).toEqual([])
  expect(await database.select().from(tables.inventoryLandedCharges)).toHaveLength(2)
})
it("preserves unreceived value and excludes damaged, other-location and pre-cutover stock from sellable FIFO", async () => {
  await zeroOpening()
  const purchase = await purchased(10, "1")
  await save({ ...receipt(purchase.record.id, 2, "before"), occurredAt: "2026-01-01T00:00:00Z" })
  await save({ ...receipt(purchase.record.id, 2, "damage"), condition: "damaged" })
  await save({ ...receipt(purchase.record.id, 2, "elsewhere"), location: "warehouse:B" })
  await save(receipt(purchase.record.id, 2, "available"))
  await landedPost(request(bill([purchase.record.id], "1")))
  const result = await inventoryFifo(orgId, range)
  expect(result.endingQuantity).toBe(2)
  expect(result.knownEndingValues).toEqual([{ currency: "USD", amount: "2.2" }])
  expect(result.excluded.receiptsAtOrBeforeCutover).toHaveLength(1)
  expect(result.excluded.nonSellableReceipts).toHaveLength(1)
  expect(result.purchases[0]).toMatchObject({ receivedQuantity: 8, unreceivedValue: "2.2" })
})
it("does not borrow future receipts and blocks subsequent costing after a shortage", async () => {
  await zeroOpening()
  const purchase = await purchased()
  await save(depletion(3, "2026-01-02"))
  await save({ ...receipt(purchase.record.id, 10), occurredAt: "2026-01-03T00:00:00Z" })
  await save(depletion(2, "2026-01-04", "2"))
  const result = await inventoryFifo(orgId, range)
  expect(result.rows.map((row) => row.status)).toEqual(["insufficient_inventory", "blocked_after_shortage"])
  expect(result.rows[0]).toMatchObject({ unallocatedQuantity: 3, cogs: null })
  expect(result.endingQuantity).toBeNull()
  expect(result.knownEndingValues).toBeNull()
  expect(result.recordedCostCoverageComplete).toBe(false)
})
it("keeps unknown opening costs unresolved and separates mixed currencies", async () => {
  const baseline = await save({ ...opening, quantity: 1 })
  const purchase = await purchased(2, "2")
  await save(receipt(purchase.record.id, 2))
  await save(depletion(2))
  const unknown = await inventoryFifo(orgId, range)
  expect(unknown.rows[0]).toMatchObject({
    status: "missing_cost",
    unknownCostQuantity: 1,
    cogs: null,
    knownCosts: [{ currency: "USD", amount: "2" }]
  })
  await save({
    ...opening,
    quantity: 1,
    supersedes: baseline.record.id,
    valuation: { status: "actual", totalCost: { amount: "3", currency: "EUR" } }
  })
  const mixed = await inventoryFifo(orgId, range)
  expect(mixed.rows[0]).toMatchObject({
    status: "mixed_currency",
    cogs: null,
    knownCosts: [
      { currency: "EUR", amount: "3" },
      { currency: "USD", amount: "2" }
    ]
  })
})
it("depletes earlier sales before calculating a later reporting window", async () => {
  await zeroOpening()
  const first = await purchased(3, "1"),
    second = await purchased(3, "2", "2")
  await save(receipt(first.record.id, 3, "a"))
  await save({ ...receipt(second.record.id, 3, "b"), occurredAt: "2026-01-04T00:00:00Z" })
  await save(depletion(3, "2026-01-03"))
  await save(depletion(2, "2026-01-05", "2"))
  const result = await inventoryFifo(orgId, { ...range, from: "2026-01-04" })
  expect(result.rows).toHaveLength(1)
  expect(result.rows[0]?.cogs?.amount).toBe("4")
  expect(result.endingQuantity).toBe(1)
})
it("validates manual shares, currencies, zero value weights and purchase dependencies", async () => {
  const purchase = await purchased(),
    foreignCurrency = await purchased(10, "2", "2", "EUR"),
    zero = await purchased(10, "0", "3")
  expect((await landedPost(request(bill([foreignCurrency.record.id])))).status).toBe(422)
  expect((await landedPost(request(bill([zero.record.id], "1", "purchase_value")))).status).toBe(422)
  expect(
    (
      await landedPost(
        request({
          ...bill([purchase.record.id], "10", "manual"),
          targets: [{ purchaseId: purchase.record.id, amount: "9" }]
        })
      )
    ).status
  ).toBe(422)
  const valid = {
    ...bill([purchase.record.id], "10", "manual"),
    targets: [{ purchaseId: purchase.record.id, amount: "10" }]
  }
  expect((await landedPost(request(valid))).status).toBe(201)
  expect((await purchaseDelete(request(null), resource(purchase.record.id))).status).toBe(409)
  expect((await purchaseRoute(request({ ...purchase.record.request, supersedes: purchase.record.id }))).status).toBe(
    409
  )
})
it("prevents excessive credits and retirement of a charge needed to keep landed value nonnegative", async () => {
  const purchase = await purchased(1, "1")
  const { charge } = await (await landedPost(request(bill([purchase.record.id], "10")))).json()
  expect((await landedPost(request({ ...bill([purchase.record.id], "-5"), sourceLine: "credit" }))).status).toBe(201)
  expect((await landedDelete(request(null), resource(charge.id))).status).toBe(422)
  expect((await landedPost(request({ ...bill([purchase.record.id], "-10"), sourceLine: "excess" }))).status).toBe(422)
})
it("replays bills, rejects duplicate sources, and scopes bill access to its workspace", async () => {
  const purchase = await purchased(),
    key = randomUUID(),
    body = bill([purchase.record.id])
  const response = await landedPost(request(body, key)),
    { charge } = await response.json()
  expect(response.headers.get("location")).toBe(`/api/analytics/landed-charges/${charge.id}`)
  expect((await landedPost(request(body, key))).status).toBe(200)
  expect((await landedPost(request({ ...body, amount: "11" }, key))).status).toBe(409)
  expect((await landedPost(request(body))).status).toBe(409)
  context.actor = actor(otherId, "buyer")
  expect((await landedGet(request(null), resource(charge.id))).status).toBe(404)
  expect((await landedDelete(request(null), resource(charge.id))).status).toBe(404)
  expect((await landedPost(request(body))).status).toBe(404)
  context.actor = actor(orgId, "buyer")
  expect((await landedDelete(request(null), resource(charge.id))).status).toBe(204)
  expect((await landedDelete(request(null), resource(charge.id))).status).toBe(204)
  expect((await landedPost(request(body, key))).status).toBe(200)
})
it("requires an explicit opening balance and preserves analytics permission and snapshot contracts", async () => {
  const url = `${appUrl()}/api/analytics/fifo?shopifyDomain=store&variantId=v1&location=warehouse:A&from=2026-01-01&to=2026-02-01`
  expect((await fifoGet(new Request(url))).status).toBe(422)
  await zeroOpening()
  const initial = await (await fifoGet(new Request(url))).json()
  await save(depletion(1))
  expect((await fifoGet(new Request(`${url}&page=1&snapshot=${initial.snapshot}`))).status).toBe(409)
  expect((await fifoGet(new Request(`${url}&page=1`))).status).toBe(400)
  context.actor = { ...actor(orgId, "buyer"), role: "member", access: { sales: "view" } }
  expect((await fifoGet(new Request(url))).status).toBe(403)
  expect((await landedList(new Request(`${appUrl()}/api/analytics/landed-charges`))).status).toBe(403)
})
it("snapshots existing PO landed bills, verifies their values and rejects duplicate imports", async () => {
  const supplierId = randomUUID(),
    orderId = randomUUID(),
    itemId = randomUUID(),
    costId = randomUUID()
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
        pieces: 10,
        piecesPerSet: 1,
        unitPrice: 100
      }
    ]
  })
  await database
    .insert(tables.orders)
    .values({ id: orderId, buyerOrgId: orgId, supplierId, shopifyDomain: "store", status: "submitted", data })
  await database
    .insert(tables.landedCosts)
    .values({ id: costId, orderId, kind: "freight", description: "Carrier", amountMinor: 500, createdBy: "user" })
  const po = await save({
    ...purchase,
    source: {
      type: "purchase_order",
      orderId,
      revision: 1,
      itemId,
      invoiceReference: "invoice",
      batchReference: "batch"
    }
  })
  const body = { ...bill([po.record.id], "5"), poLandedCostId: costId }
  expect((await landedPost(request({ ...body, amount: "6" }))).status).toBe(409)
  const { charge } = await (await landedPost(request(body))).json()
  expect(charge.allocations).toEqual([{ purchaseId: po.record.id, amount: "5" }])
  expect((await landedPost(request({ ...body, sourceReference: "another-label" }))).status).toBe(409)
  await database.update(tables.landedCosts).set({ amountMinor: 900 }).where(eq(tables.landedCosts.id, costId))
  expect((await (await landedGet(request(null), resource(charge.id))).json()).charge.data.amount).toBe("5")
})
it("conserves micro-unit rounding over split receipts and depletion", async () => {
  await zeroOpening()
  const purchase = await purchased(3, "0")
  await landedPost(request(bill([purchase.record.id], "0.000002")))
  for (let index = 0; index < 3; index++) {
    await save(receipt(purchase.record.id, 1, String(index)))
    await save(depletion(1, "2026-01-03", String(index)))
  }
  const result = await inventoryFifo(orgId, range)
  expect(result.knownCogsByCurrency).toEqual([{ currency: "USD", amount: "0.000002" }])
  expect(result.endingQuantity).toBe(0)
  expect(result.knownEndingValues).toEqual([{ currency: "USD", amount: "0" }])
})
