import { randomUUID } from "node:crypto"
import { type Amazon, ProviderError } from "@repo/copacker-marketplaces/amazon"
import { sql } from "drizzle-orm"
import { beforeEach, it, expect, vi } from "vitest"
import * as tables from "../src/db/schema"
import { database, setUpTestDatabase } from "./test-db"
const context = vi.hoisted(() => ({ graphql: vi.fn<(query: string) => Promise<unknown>>() }))
vi.mock("@/db", () => import("./test-db"))
import { syncAmazonExtraEvidence } from "../src/server/amazon-extra-evidence"
import { syncAmazonReceipts } from "../src/server/amazon-receipts"
import { analyticsJob, queueShopifyEconomics } from "../src/server/analytics-jobs"
vi.mock("../src/server/connections", () => ({ shopifyFor: async () => ({ graphql: context.graphql }) }))
import { economicsQueries } from "@repo/copacker-marketplaces/shopify-economics"
import { importAnalyticsCosts, getCostImport, previewAnalyticsCosts } from "../src/server/analytics-cost-imports"
import { ingestionStatus, listIngestionEvidence } from "../src/server/analytics-ingestion"
import { syncShopifyEconomics } from "../src/server/shopify-economics"
const orgId = randomUUID(),
  otherId = randomUUID()
setUpTestDatabase({ truncate: true })
beforeEach(async () => {
  await database.delete(tables.jobs)
  await database.insert(tables.organizations).values([
    { id: orgId, kind: "buyer", name: "Buyer" },
    { id: otherId, kind: "buyer", name: "Other" }
  ])
})
const expense = {
  sourceReference: "invoice-1",
  sourceLine: "1",
  occurredAt: "2026-01-01T00:00:00Z",
  category: "return_shipping",
  amount: "12.34",
  currency: "USD",
  costBasis: "actual",
  evidence: "Carrier invoice",
  attribution: { kind: "shared", reason: "No order reference" }
}
it("reconciles receipt movements only within the seller, workspace and marketplace", async () => {
  await database.insert(tables.analyticsEvidence).values({
    orgId,
    source: "amazon",
    externalAccountId: "seller",
    dataset: "fba_inbound_receipts",
    sourceId: "SHIP",
    data: { status: "CLOSED", items: [{ sku: "SKU", sent: 8, received: 8, unit: "UNITS" }] }
  })
  const movement = {
    orgId,
    externalAccountId: "seller",
    marketplaceId: "ATVPDKIKX0DER",
    eventDay: "2026-09-01",
    eventType: "Receipts",
    referenceId: "SHIP",
    sku: "SKU",
    quantity: 8
  }
  await database
    .insert(tables.amazonInventoryMovements)
    .values([
      movement,
      { ...movement, orgId: otherId, quantity: 99 },
      { ...movement, externalAccountId: "other", quantity: 99 },
      { ...movement, marketplaceId: "other", quantity: 99 }
    ])
  const query = {
    source: "amazon" as const,
    externalAccountId: "seller",
    dataset: "fba_inbound_receipts" as const,
    page: 0
  }
  const result = await listIngestionEvidence(orgId, query)
  expect(result.rows[0]?.receiptReconciliation?.rows[0]).toMatchObject({
    status: "quantity_agrees",
    movementQuantity: 8
  })
  await database.insert(tables.amazonInventoryMovements).values({ ...movement, quantity: 1 })
  await expect(listIngestionEvidence(orgId, { ...query, page: 1, snapshot: result.snapshot })).rejects.toThrow(
    "Data changed"
  )
})
it("reports missing cost basis as unknown while excluding retired and foreign inputs", async () => {
  for (const [workspace, retiredAt, sourceKey] of [
    [orgId, null, "active"],
    [orgId, "2026-01-02", "retired"],
    [otherId, null, "foreign"]
  ] as const) {
    await database.execute(sql`
      insert into inventory_basis_records
        ("orgId", kind, "shopifyDomain", "variantId", "occurredAt", "sourceKey", quantity, "piecesPerUnit", data, request, "createdBy", "retiredAt")
      values (${workspace}, 'purchase', 'shop', 'variant', '2026-01-01', ${sourceKey}, 1, 1, '{}', '{}', 'test', ${retiredAt})
    `)
    await database.execute(sql`
      insert into inventory_landed_charges
        (id, "orgId", "sourceKey", "occurredAt", data, allocations, "createdBy", "retiredAt")
      values (${randomUUID()}, ${workspace}, ${sourceKey}, '2026-01-01', '{}', '[]', 'test', ${retiredAt})
    `)
  }
  const status = await ingestionStatus(orgId)
  expect(status.accountingInputs.counts).toEqual(
    expect.arrayContaining([
      { input: "purchase", basis: "unknown", count: 1 },
      { input: "landed_charges", basis: "unknown", count: 1 }
    ])
  )
  expect(status.accountingInputs.coverage).toBe("not_assessed")
})
it("imports atomically, replays safely and rejects other workspaces", async () => {
  const key = randomUUID(),
    id = randomUUID(),
    body = { rows: [{ id, kind: "expense", data: expense }] }
  expect((await importAnalyticsCosts(orgId, "owner", key, body)).replayed).toBe(false)
  expect((await importAnalyticsCosts(orgId, "owner", key, body)).replayed).toBe(true)
  await expect(getCostImport(otherId, key)).rejects.toMatchObject({ status: 404 })
  await expect(
    importAnalyticsCosts(orgId, "owner", randomUUID(), {
      rows: [
        { id: randomUUID(), kind: "expense", data: { ...expense, sourceLine: "2" } },
        { id: randomUUID(), kind: "expense", data: expense }
      ]
    })
  ).rejects.toMatchObject({ code: "duplicate_source" })
  expect(await database.select().from(tables.operatingCosts)).toHaveLength(1)
  await importAnalyticsCosts(orgId, "owner", randomUUID(), {
    rows: [{ id: randomUUID(), kind: "expense", data: { ...expense, amount: "10", supersedes: id } }]
  })
  const costs = await database.select().from(tables.operatingCosts)
  expect(costs.filter((r) => r.retiredAt)).toHaveLength(1)
})
it("filters marketplace copies and scopes paginated financial evidence", async () => {
  await database.insert(tables.analyticsEvidence).values([
    {
      orgId,
      source: "shopify",
      externalAccountId: "shop",
      dataset: "order_economics",
      sourceId: "1",
      data: { tags: ["eBay"], test: false }
    },
    {
      orgId,
      source: "shopify",
      externalAccountId: "shop",
      dataset: "order_economics",
      sourceId: "2",
      data: { tags: [], test: false }
    },
    {
      orgId: otherId,
      source: "shopify",
      externalAccountId: "shop",
      dataset: "order_economics",
      sourceId: "3",
      data: { tags: [], test: false }
    }
  ])
  const result = await listIngestionEvidence(orgId, {
    source: "shopify",
    externalAccountId: "shop",
    dataset: "order_economics",
    page: 0
  })
  expect(result.rows.map((r) => r.sourceId)).toEqual(["2"])
})
it("reconciles saved Shopify evidence with only the same account's balances and invalidates changed balances", async () => {
  const amount = { amount: "10", currencyCode: "USD" }
  await database.insert(tables.analyticsEvidence).values({
    orgId,
    source: "shopify",
    externalAccountId: "shop",
    dataset: "order_economics",
    sourceId: "ORDER",
    data: {
      tags: [],
      test: false,
      currentTotalPriceSet: { shopMoney: amount },
      refunds: [],
      transactions: [
        {
          id: "T",
          kind: "SALE",
          status: "SUCCESS",
          gateway: "shopify_payments",
          fees: [],
          amountSet: { shopMoney: amount }
        }
      ]
    }
  })
  const row = {
    orgId,
    externalAccountId: "shop",
    transactionId: "B",
    orderId: "ORDER",
    type: "CHARGE",
    processedAt: new Date("2025-01-01"),
    currency: "USD",
    amountMinor: 1000,
    feeMinor: 0,
    netMinor: 1000,
    data: { amount, fee: { ...amount, amount: "0" }, net: amount }
  }
  await database
    .insert(tables.shopifyBalanceTransactions)
    .values([row, { ...row, orgId: otherId }, { ...row, externalAccountId: "foreign" }])
  const query = { source: "shopify" as const, externalAccountId: "shop", dataset: "order_economics" as const, page: 0 }
  const result = await listIngestionEvidence(orgId, query)
  expect(result.rows[0]?.paymentReconciliation).toMatchObject({
    orderTotalCheck: "balanced",
    balanceComparison: { totals: [{ rows: 1 }], arithmetic: [{ transactionId: "B", check: "balanced" }] }
  })
  await database.update(tables.shopifyBalanceTransactions).set({ feeMinor: 100 })
  await expect(listIngestionEvidence(orgId, { ...query, page: 1, snapshot: result.snapshot })).rejects.toMatchObject({
    code: "snapshot_changed"
  })
})
it("preserves missing receipt quantities and isolates network failures", async () => {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId: "seller", encryptedToken: "x" })
  await database.insert(tables.salesSyncs).values({ orgId, source: "amazon", externalAccountId: "seller", revision: 1 })
  await syncAmazonReceipts(
    {
      orgId,
      externalAccountId: "seller",
      revision: 1,
      amazon: {
        fbaShipments: async () => [{ shipmentId: "FBA1", name: null, status: "CLOSED" }],
        fbaReceiptItems: async () => [{ sku: "SKU", sent: 12, received: null, unit: "UNITS" }],
        awdShipments: async () => {
          throw new Error("No access")
        },
        awdReceiptItems: async () => {
          throw new Error("No access")
        }
      }
    },
    async () => undefined
  )
  const rows = await database.select().from(tables.analyticsEvidence)
  expect(rows[0]?.data.items).toEqual([{ sku: "SKU", sent: 12, received: null, unit: "UNITS", difference: null }])
  expect(
    (await database.select().from(tables.analyticsFeeds)).find((r) => r.dataset === "awd_inbound_receipts")?.state.error
  ).toBe("collection_failed")
})

it("checkpoints Shopify updated-order scans and preserves progress on a failed page", async () => {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "shopify", externalId: "shop", encryptedToken: "x" })
  await database.insert(tables.salesSyncs).values({ orgId, source: "shopify", externalAccountId: "shop", revision: 1 })
  context.graphql.mockImplementation(async (query) =>
    query === economicsQueries.orders
      ? {
          shop: { myshopifyDomain: "shop" },
          orders: {
            nodes: [{ id: "order", updatedAt: "2026-01-02T00:00:00Z" }],
            pageInfo: { hasNextPage: true, endCursor: "next" }
          }
        }
      : {
          order: {
            id: "order",
            updatedAt: "2026-01-02T00:00:00Z",
            tags: [],
            test: false,
            transactions: [],
            refunds: []
          }
        }
  )
  const input = { orgId, externalAccountId: "shop", revision: 1, scopes: "read_orders" }
  await syncShopifyEconomics(input, async () => undefined, new Date("2026-01-05T00:00:00Z"))
  expect((await database.select().from(tables.analyticsFeeds))[0]?.state).toMatchObject({ after: "next", error: null })
  expect((await database.select().from(tables.analyticsEvidence))[0]?.data).toMatchObject({
    returns: null,
    returnsCoverage: "missing_scope"
  })
  context.graphql.mockRejectedValue(new Error("Source unavailable"))
  await syncShopifyEconomics(input, async () => undefined, new Date("2026-01-06T00:00:00Z"))
  expect((await database.select().from(tables.analyticsFeeds))[0]?.state).toMatchObject({
    after: "next",
    error: "collection_failed"
  })
  expect(await database.select().from(tables.analyticsEvidence)).toHaveLength(1)
})

it("previews corrections without retiring costs or reserving row IDs, then revalidates on import", async () => {
  const oldId = randomUUID(),
    replacementId = randomUUID()
  await importAnalyticsCosts(orgId, "owner", randomUUID(), {
    rows: [{ id: oldId, kind: "expense", data: expense }]
  })
  const body = { rows: [{ id: replacementId, kind: "expense", data: { ...expense, amount: "10", supersedes: oldId } }] }
  const before = await database.select().from(tables.operatingCosts)
  const preview = await previewAnalyticsCosts(orgId, "owner", body)
  expect(preview).toMatchObject({ count: 1, rows: [{ id: replacementId }] })
  expect(await database.select().from(tables.operatingCosts)).toEqual(before)
  expect(await database.select().from(tables.analyticsCostImports)).toHaveLength(1)
  await expect(previewAnalyticsCosts(otherId, "owner", body)).rejects.toMatchObject({ code: "record_changed" })
  await importAnalyticsCosts(orgId, "owner", randomUUID(), {
    rows: [{ id: randomUUID(), kind: "expense", data: { ...expense, amount: "11", supersedes: oldId } }]
  })
  await expect(importAnalyticsCosts(orgId, "owner", randomUUID(), { rows: preview.rows })).rejects.toMatchObject({
    code: "record_changed"
  })
})
it("rolls back an entire failed preview and leaves IDs available for a valid import", async () => {
  const id = randomUUID()
  const row = { id, kind: "expense", data: expense }
  await expect(
    previewAnalyticsCosts(orgId, "owner", { rows: [row, { ...row, id: randomUUID() }] })
  ).rejects.toMatchObject({ code: "duplicate_source" })
  expect(await database.select().from(tables.operatingCosts)).toHaveLength(0)
  expect(await database.select().from(tables.analyticsCostImports)).toHaveLength(0)
  const preview = await previewAnalyticsCosts(orgId, "owner", { rows: [row] })
  expect(preview.rows[0]?.data.occurredAt).toBe("2026-01-01T00:00:00.000Z")
  await importAnalyticsCosts(orgId, "owner", randomUUID(), { rows: preview.rows })
  expect(await database.select().from(tables.operatingCosts)).toHaveLength(1)
})

it("previews linked purchases, receipts and landed charges together without retaining any records", async () => {
  await database.insert(tables.variantFields).values({ orgId, shopifyDomain: "store", variantId: "v1" })
  const purchaseId = randomUUID()
  const common = {
    sourceReference: "invoice",
    sourceLine: "1",
    occurredAt: "2020-01-01T00:00:00Z",
    evidence: "Historical invoice"
  }
  const rows = [
    {
      id: purchaseId,
      kind: "inventory",
      data: {
        ...common,
        kind: "purchase",
        source: {
          type: "manual",
          shopifyDomain: "store",
          variantId: "v1",
          quantity: 10,
          piecesPerUnit: 1,
          unitCost: { amount: "1.123456", currency: "USD" },
          supplierReference: "supplier",
          invoiceReference: "invoice",
          batchReference: "batch"
        }
      }
    },
    {
      id: randomUUID(),
      kind: "inventory",
      data: {
        ...common,
        sourceReference: "receipt",
        kind: "receipt",
        purchaseId,
        quantity: 10,
        location: "warehouse",
        condition: "sellable"
      }
    },
    {
      id: randomUUID(),
      kind: "landed",
      data: {
        ...common,
        sourceReference: "freight",
        category: "freight",
        costBasis: "actual",
        amount: "3.123456",
        currency: "USD",
        basis: "pieces",
        targets: [{ purchaseId }]
      }
    }
  ]
  const preview = await previewAnalyticsCosts(orgId, "owner", { rows })
  expect(preview.count).toBe(3)
  expect(await database.select().from(tables.inventoryBasisRecords)).toHaveLength(0)
  expect(await database.select().from(tables.inventoryLandedCharges)).toHaveLength(0)
  expect(await database.select().from(tables.analyticsCostImports)).toHaveLength(0)
  await importAnalyticsCosts(orgId, "owner", randomUUID(), { rows: preview.rows })
  expect(await database.select().from(tables.inventoryBasisRecords)).toHaveLength(2)
  expect((await database.select().from(tables.inventoryLandedCharges))[0]?.allocations).toEqual([
    { purchaseId, amount: "3.123456" }
  ])
})

it("discovers Shopify financial history older than two years and continues bounded windows", async () => {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "shopify", externalId: "shop", encryptedToken: "x" })
  await database.insert(tables.salesSyncs).values({ orgId, source: "shopify", externalAccountId: "shop", revision: 1 })
  context.graphql.mockImplementation(async (query) =>
    query === economicsQueries.earliest
      ? { shop: { myshopifyDomain: "shop" }, orders: { nodes: [{ updatedAt: "2010-01-01T00:00:00Z" }] } }
      : { shop: { myshopifyDomain: "shop" }, orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }
  )
  const input = { orgId, externalAccountId: "shop", revision: 1, scopes: "read_orders,read_all_orders" }
  expect(await syncShopifyEconomics(input, async () => undefined, new Date("2026-01-05T00:00:00Z"))).toEqual({
    hasMore: true,
    failed: false
  })
  expect((await database.select().from(tables.analyticsFeeds))[0]?.state).toMatchObject({
    coveredFrom: "2010-01-01T00:00:00.000Z",
    coveredTo: "2010-02-01T00:00:00.000Z",
    history: "available"
  })
  await syncShopifyEconomics(input, async () => undefined, new Date("2026-01-05T00:00:00Z"))
  expect((await database.select().from(tables.analyticsFeeds))[0]?.state.coveredTo).toBe("2010-03-03T00:00:00.000Z")
})
it("queues financial backfills once and retries failures independently of completed sales", async () => {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "shopify", externalId: "shop", encryptedToken: "x", scopes: "read_orders" })
  await database
    .insert(tables.salesSyncs)
    .values({ orgId, source: "shopify", externalAccountId: "shop", revision: 1, status: "idle" })
  const input = { orgId, externalAccountId: "shop", revision: 1 }
  await queueShopifyEconomics(input)
  await queueShopifyEconomics(input)
  expect(await database.select().from(tables.jobs)).toHaveLength(1)
  context.graphql.mockRejectedValue(new Error("Throttled"))
  await expect(analyticsJob(input, { assertOwned: async () => undefined })).rejects.toMatchObject({
    options: { delayMs: 60000 }
  })
  expect((await database.select().from(tables.salesSyncs))[0]?.status).toBe("idle")
  context.graphql.mockResolvedValue({
    shop: { myshopifyDomain: "shop" },
    orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
  })
  await analyticsJob(input, { assertOwned: async () => undefined })
  expect((await database.select().from(tables.analyticsFeeds))[0]?.state.error).toBeNull()
  context.graphql.mockClear()
  await analyticsJob({ ...input, revision: 2 }, { assertOwned: async () => undefined })
  expect(context.graphql).not.toHaveBeenCalled()
})
it("attempts every missing FBM month and preserves prior coverage when refresh fails", async () => {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId: "seller", encryptedToken: "x" })
  await database.insert(tables.salesSyncs).values({ orgId, source: "amazon", externalAccountId: "seller", revision: 1 })
  await database.insert(tables.analyticsFeeds).values({
    orgId,
    source: "amazon",
    externalAccountId: "seller",
    dataset: "fbm_returns:2026-01",
    checkedAt: new Date("2026-01-01T00:00:00Z"),
    state: { coveredFrom: "2026-01-01T00:00:00Z", coveredTo: "2026-01-02T00:00:00Z" }
  })
  const report = vi.fn<() => Promise<null>>(async () => null)
  await syncAmazonExtraEvidence(
    { orgId, externalAccountId: "seller", revision: 1, amazon: { report } },
    async () => undefined,
    new Date("2026-01-05T00:00:00Z")
  )
  expect(report).toHaveBeenCalledTimes(13)
  const feeds = await database.select().from(tables.analyticsFeeds)
  expect(feeds.find((r) => r.dataset === "fbm_returns:2026-01")?.state).toMatchObject({
    coveredTo: "2026-01-02T00:00:00Z",
    error: "report_cancelled"
  })
  expect(feeds.filter((r) => r.dataset.startsWith("fbm_returns:"))).toHaveLength(13)
})

it.each([401, 403, 429, 503])(
  "stops FBM requests after provider status %s without claiming older coverage",
  async (status) => {
    await database
      .insert(tables.connections)
      .values({ orgId, provider: "amazon", externalId: "seller", encryptedToken: "x" })
    await database
      .insert(tables.salesSyncs)
      .values({ orgId, source: "amazon", externalAccountId: "seller", revision: 1 })
    const report = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValue(new ProviderError(status, null, "private provider detail"))
    await syncAmazonExtraEvidence(
      { orgId, externalAccountId: "seller", revision: 1, amazon: { report } },
      async () => undefined,
      new Date("2026-01-05T00:00:00Z")
    )
    expect(report).toHaveBeenCalledTimes(1)
    const feeds = await database.select().from(tables.analyticsFeeds)
    const periods = feeds.filter((row) => row.dataset.startsWith("fbm_returns:"))
    expect(periods).toHaveLength(1)
    expect(periods[0]?.state).toEqual({ error: status < 429 ? "report_access_denied" : "report_throttled" })
    expect(feeds.find((row) => row.dataset === "awd_costs")?.state.error).toBeNull()
  }
)

it("keeps successful receipt snapshots when another shipment has an invalid document", async () => {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId: "seller", encryptedToken: "x" })
  await database.insert(tables.salesSyncs).values({ orgId, source: "amazon", externalAccountId: "seller", revision: 1 })
  await syncAmazonReceipts(
    {
      orgId,
      externalAccountId: "seller",
      revision: 1,
      amazon: {
        fbaShipments: async () => [],
        fbaReceiptItems: async () => [],
        awdShipments: async () =>
          ["good", "bad", "later"].map((shipmentId) => ({
            shipmentId,
            orderId: "order",
            status: "CLOSED",
            createdAt: null
          })),
        awdReceiptItems: async (shipmentId) => {
          if (shipmentId === "bad") {
            throw new Error("Invalid document")
          }
          return {
            shipmentId,
            shipmentStatus: "CLOSED",
            shipmentSkuQuantities: [{ sku: "SKU", expectedQuantity: { quantity: 2, unitOfMeasurement: "UNITS" } }]
          }
        }
      }
    },
    async () => undefined
  )
  expect((await database.select().from(tables.analyticsEvidence)).map((row) => row.sourceId).sort()).toEqual([
    "good",
    "later"
  ])
  expect(
    (await database.select().from(tables.analyticsFeeds)).find((row) => row.dataset === "awd_inbound_receipts")?.state
      .error
  ).toBe("collection_failed")
})

it("stops receipt requests when the sync revision changes before a checkpoint", async () => {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId: "seller", encryptedToken: "x" })
  await database.insert(tables.salesSyncs).values({ orgId, source: "amazon", externalAccountId: "seller", revision: 1 })
  const receipt = vi.fn<Amazon["fbaReceiptItems"]>(async () => {
    await database.update(tables.salesSyncs).set({ revision: 2 })
    return []
  })
  const awdShipments = vi.fn<Amazon["awdShipments"]>(async () => [])
  await expect(
    syncAmazonReceipts(
      {
        orgId,
        externalAccountId: "seller",
        revision: 1,
        amazon: {
          fbaShipments: async () =>
            ["first", "second"].map((shipmentId) => ({ shipmentId, name: null, status: "CLOSED" })),
          fbaReceiptItems: receipt,
          awdShipments,
          awdReceiptItems: async (shipmentId) => ({ shipmentId, shipmentStatus: "CLOSED" })
        }
      },
      async () => undefined
    )
  ).rejects.toThrow("superseded")
  expect(receipt).toHaveBeenCalledTimes(1)
  expect(awdShipments).not.toHaveBeenCalled()
  expect(await database.select().from(tables.analyticsEvidence)).toEqual([])
})

it("stops both receipt networks after recording a transient checkpoint failure", async () => {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId: "seller", encryptedToken: "x" })
  await database.insert(tables.salesSyncs).values({ orgId, source: "amazon", externalAccountId: "seller", revision: 1 })
  const receipt = vi.fn<Amazon["fbaReceiptItems"]>(async () => [])
  const awdShipments = vi.fn<Amazon["awdShipments"]>(async () => [])
  const transaction = vi.spyOn(database, "transaction").mockRejectedValueOnce(new Error("Database unavailable"))
  try {
    await syncAmazonReceipts(
      {
        orgId,
        externalAccountId: "seller",
        revision: 1,
        amazon: {
          fbaShipments: async () =>
            ["first", "second"].map((shipmentId) => ({ shipmentId, name: null, status: "CLOSED" })),
          fbaReceiptItems: receipt,
          awdShipments,
          awdReceiptItems: async (shipmentId) => ({ shipmentId, shipmentStatus: "CLOSED" })
        }
      },
      async () => undefined
    )
    expect(receipt).toHaveBeenCalledTimes(1)
    expect(awdShipments).not.toHaveBeenCalled()
    expect(
      (await database.select().from(tables.analyticsFeeds)).find((row) => row.dataset === "fba_inbound_receipts")?.state
        .error
    ).toBe("collection_failed")
  } finally {
    transaction.mockRestore()
  }
})
