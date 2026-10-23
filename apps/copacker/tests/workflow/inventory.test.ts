import { randomUUID } from "node:crypto"
import { ProviderError } from "@repo/copacker-marketplaces/amazon"
import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { GET as inventoryRoute } from "../../src/server/http/api/inventory"
import { GET as locationsRoute, PATCH as patchLocationRoute } from "../../src/server/http/api/inventory/locations"
import { POST as refreshRoute } from "../../src/server/http/api/inventory/refresh"
import { saveLocationMapping } from "../../src/server/inventory-location-settings"
import {
  assignProductSupplier,
  lineDefaultsFor,
  readProductDefaults,
  saveProductDefaults
} from "../../src/server/product-defaults"
import { productsWithoutSupplier } from "../../src/server/product-suppliers"
import { runNextJob } from "../../src/server/queue"
import { provider } from "../mocks/providers"
import { served } from "../served"
import { database } from "../test-db"
import { signedIn } from "../test-session"
import {
  actor,
  buyer,
  buyerId,
  orderConnections,
  otherId,
  setUpWorkflowTests,
  supplier,
  supplierLinkId
} from "./fixtures"

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
const readInventory = served(inventoryRoute)
const readLocations = served(locationsRoute)
const patchLocation = served(patchLocationRoute)
const refreshInventory = served(refreshRoute)

describe("inventory and product defaults", () => {
  async function stockAccount() {
    await database
      .insert(tables.connections)
      .values({ orgId: buyerId, provider: "amazon", externalId: "SELLER", encryptedToken: "unused-test-token" })
  }
  const stockData = {
    source: "awd" as const,
    scopeKey: "us" as const,
    startedAt: "2026-09-25T15:00:00.000Z",
    observedAt: "2026-09-25T15:01:00.000Z",
    rows: ["a", "b"].map((sellerSku) => ({
      sellerSku,
      unit: "amazon_sellable_unit" as const,
      onHand: 20,
      inbound: null,
      availableDistributable: null,
      reservedDistributable: null,
      replenishment: null
    }))
  }
  const refreshRequest = () =>
    new Request("http://localhost/api/inventory/refresh", {
      method: "POST",
      headers: { Origin: process.env.APP_URL ?? "http://localhost:3000" },
      body: JSON.stringify({ source: "awd" })
    })

  const fbaData = {
    source: "fba",
    scopeKey: "ATVPDKIKX0DER",
    startedAt: stockData.startedAt,
    observedAt: stockData.observedAt,
    rows: [{ sellerSku: "cord", fnSku: "X1", totalQuantity: 5, unit: "amazon_sellable_unit" }]
  }
  const refreshFba = () =>
    refreshInventory(
      new Request("http://localhost/api/inventory/refresh", {
        method: "POST",
        headers: { Origin: process.env.APP_URL ?? "http://localhost:3000" },
        body: JSON.stringify({ source: "fba", marketplaceId: "ATVPDKIKX0DER" })
      })
    )
  const readFba = () =>
    readInventory(new Request("http://localhost/api/inventory?source=fba&marketplaceId=ATVPDKIKX0DER"))
  it("queues both Amazon inventory refreshes despite an old empty connection selection", async () => {
    await stockAccount()
    await database
      .update(tables.connections)
      .set({ inventoryLocations: [] })
      .where(and(eq(tables.connections.orgId, buyerId), eq(tables.connections.provider, "amazon")))
    expect((await refreshFba()).status).toBe(202)
    expect((await refreshInventory(refreshRequest())).status).toBe(202)
    const snapshots = await database
      .select()
      .from(tables.stockSnapshots)
      .where(eq(tables.stockSnapshots.orgId, buyerId))
    expect(snapshots.map(({ source, status }) => ({ source, status }))).toEqual(
      expect.arrayContaining([
        { source: "fba", status: "queued" },
        { source: "awd", status: "queued" }
      ])
    )
    expect(await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "stock"))).toHaveLength(2)
  })
  it("publishes isolated FBA stock and preserves it on failed refresh", async () => {
    await stockAccount()
    provider.api.fbaStock.mockResolvedValue(fbaData)
    const first = await refreshFba()
    expect(first.status).toBe(202)
    expect(await (await refreshFba()).json()).toEqual(await first.json())
    await runNextJob()
    expect(provider.api.fbaStock).toHaveBeenCalledWith("ATVPDKIKX0DER", expect.any(Function))
    expect(provider.amazonFor).toHaveBeenCalledWith(buyerId, "SELLER")
    const result = await (await readFba()).json()
    expect(result.rows).toEqual(fbaData.rows)
    expect(result.source).toBe("fba")
    expect((await (await readInventory(new Request("http://localhost/api/inventory?source=awd"))).json()).rows).toEqual(
      []
    )
    provider.api.fbaStock.mockRejectedValue(new Error("private failure"))
    await refreshFba()
    await runNextJob()
    const failed = await (await readFba()).json()
    expect(failed.snapshotId).toBe(result.snapshotId)
    expect(failed.refresh.errorCode).toBe("refresh_failed")
    signedIn.actor = actor("buyer", otherId)
    expect((await (await readFba()).json()).rows).toEqual([])
    expect((await refreshFba()).status).toBe(409)
    signedIn.actor = supplier
    expect((await refreshFba()).status).toBe(403)
  })
  it("requires an explicit supported marketplace for FBA only", async () => {
    for (const body of [
      { source: "fba" },
      { source: "fba", marketplaceId: "OTHER" },
      { source: "awd", marketplaceId: "ATVPDKIKX0DER" }
    ]) {
      expect(
        (
          await refreshInventory(
            new Request("http://localhost/api/inventory/refresh", {
              method: "POST",
              headers: { Origin: process.env.APP_URL ?? "http://localhost:3000" },
              body: JSON.stringify(body)
            })
          )
        ).status
      ).toBe(400)
      expect(
        (
          await readInventory(
            new Request(
              `http://localhost/api/inventory?${new URLSearchParams(Object.entries(body).map(([key, value]) => [key, value ?? ""]))}`
            )
          )
        ).status
      ).toBe(400)
    }
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
  })
  it.each(["wrong marketplace", "changed seller", "lost ownership"])(
    "rejects FBA publication after %s",
    async (reason) => {
      await stockAccount()
      provider.api.fbaStock.mockImplementation(async () => {
        if (reason === "changed seller") {
          await database
            .update(tables.connections)
            .set({ externalId: "OTHER" })
            .where(eq(tables.connections.orgId, buyerId))
        }
        if (reason === "lost ownership") {
          await database.update(tables.jobs).set({ attempts: 2 }).where(eq(tables.jobs.kind, "stock"))
        }
        return reason === "wrong marketplace" ? { ...fbaData, scopeKey: "OTHER" } : fbaData
      })
      await refreshFba()
      await runNextJob()
      const [stored] = await database.select().from(tables.stockSnapshots)
      expect(stored?.snapshotId).toBeNull()
      expect(stored?.status).toBe(reason === "lost ownership" ? "running" : "failed")
    }
  )

  const shopifyStock = {
    source: "shopify" as const,
    scopeKey: "store" as const,
    shopifyDomain: "test.myshopify.com",
    startedAt: stockData.startedAt,
    observedAt: stockData.observedAt,
    rows: [
      {
        variantId: "gid://shopify/ProductVariant/1",
        inventoryItemId: "gid://shopify/InventoryItem/1",
        buyerSku: null,
        tracked: false,
        unit: "shopify_inventory_unit" as const,
        levels: []
      }
    ]
  }
  const refreshShopify = () =>
    refreshInventory(
      new Request("http://localhost/api/inventory/refresh", {
        method: "POST",
        headers: { Origin: process.env.APP_URL ?? "http://localhost:3000" },
        body: JSON.stringify({ source: "shopify" })
      })
    )
  const readShopify = () => readInventory(new Request("http://localhost/api/inventory?source=shopify"))
  async function shopifyStockAccount() {
    await database.insert(tables.connections).values({
      orgId: buyerId,
      provider: "shopify",
      externalId: shopifyStock.shopifyDomain,
      encryptedToken: "unused-test-token"
    })
    provider.shopifyFor.mockResolvedValue(provider.api)
    provider.api.stock.mockResolvedValue(shopifyStock)
  }

  it("serves tenant-scoped location settings and reports stale updates through HTTP", async () => {
    expect(await (await readLocations()).json()).toMatchObject({ shopifyDomain: null, locations: [] })
    await shopifyStockAccount()
    const locationId = "gid://shopify/Location/1"
    provider.api.stock.mockResolvedValue({
      ...shopifyStock,
      rows: [
        {
          ...shopifyStock.rows[0],
          levels: [{ locationId, locationName: "Warehouse", available: 1, onHand: 1, incoming: 0, committed: 0 }]
        }
      ]
    })
    await refreshShopify()
    await runNextJob()
    const response = await readLocations()
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    const current = await response.json()
    expect(current.locations).toEqual([
      {
        locationId,
        name: "Warehouse",
        kind: null,
        classification: "unresolved",
        automatic: "unresolved",
        saved: false,
        revision: 0
      }
    ])
    const body = { locationId, classification: "merchant", expectedRevision: 0, snapshotId: current.snapshotId }
    const patch = (input: unknown) =>
      patchLocation(
        new Request("http://localhost/api/inventory/locations", { method: "PATCH", body: JSON.stringify(input) })
      )
    expect((await patch(body)).status).toBe(200)
    expect((await patch(body)).status).toBe(409)
    expect((await patch({ ...body, orgId: otherId })).status).toBe(400)
    expect((await (await readLocations()).json()).locations[0]).toMatchObject({
      classification: "merchant",
      revision: 1
    })
    signedIn.actor = actor("buyer", otherId)
    expect((await (await readLocations()).json()).locations).toEqual([])
    expect((await patch(body)).status).toBe(409)
    signedIn.actor = supplier
    expect((await readLocations()).status).toBe(403)
    expect((await patch(body)).status).toBe(403)
  })

  it("persists location classification with tenant, snapshot and revision checks", async () => {
    await shopifyStockAccount()
    const locationId = "gid://shopify/Location/1"
    provider.api.stock.mockResolvedValue({
      ...shopifyStock,
      rows: [
        {
          ...shopifyStock.rows[0],
          levels: [{ locationId, locationName: "Amazon mirror", available: 10, onHand: 10, incoming: 3, committed: 0 }]
        }
      ]
    })
    await refreshShopify()
    await runNextJob()
    const snapshot = await (await readShopify()).json()
    const input = { snapshotId: snapshot.snapshotId, locationId, classification: "amazon_mirror", expectedRevision: 0 }
    expect(await saveLocationMapping(buyer, input)).toMatchObject({
      orgId: buyerId,
      shopifyDomain: shopifyStock.shopifyDomain,
      classification: "amazon_mirror",
      revision: 1
    })
    await expect(saveLocationMapping(buyer, input)).rejects.toThrow("settings changed")
    expect(
      await saveLocationMapping(buyer, { ...input, classification: "merchant", expectedRevision: 1 })
    ).toMatchObject({ revision: 2, classification: "merchant" })
    await expect(saveLocationMapping(supplier, input)).rejects.toThrow("buyer workspace")
    await expect(saveLocationMapping(actor("buyer", otherId), input)).rejects.toThrow("Connect Shopify")
    await expect(saveLocationMapping(buyer, { ...input, locationId: "gid://shopify/Location/999" })).rejects.toThrow(
      "isn’t in this store"
    )
    await expect(saveLocationMapping(buyer, { ...input, snapshotId: randomUUID() })).rejects.toThrow(
      "Inventory changed"
    )
    await database
      .update(tables.connections)
      .set({ externalId: "other.myshopify.com" })
      .where(eq(tables.connections.orgId, buyerId))
    await expect(saveLocationMapping(buyer, { ...input, expectedRevision: 2 })).rejects.toThrow("Inventory changed")
    expect(await database.select().from(tables.inventoryLocationMappings)).toHaveLength(1)
  })

  it("lists tracked products without a supplier until one is chosen", async () => {
    await shopifyStockAccount()
    const tracked = (id: number, productId: string, productTitle: string) => ({
      ...shopifyStock.rows[0],
      variantId: `gid://shopify/ProductVariant/${id}`,
      inventoryItemId: `gid://shopify/InventoryItem/${id}`,
      buyerSku: `sku-${id}`,
      tracked: true,
      productId,
      productTitle
    })
    provider.api.stock.mockResolvedValue({
      ...shopifyStock,
      rows: [
        tracked(1, "gid://shopify/Product/10", "Glove"),
        tracked(2, "gid://shopify/Product/10", "Glove"),
        tracked(3, "gid://shopify/Product/11", "Cord"),
        tracked(5, "gid://shopify/Product/13", "Mask"),
        tracked(7, "gid://shopify/Product/15", "Guard"),
        tracked(8, "gid://shopify/Product/16", "Cord 2-pack"),
        // A bundle's supplier is on its components, so a bundle without one isn't listed.
        {
          ...tracked(9, "gid://shopify/Product/17", "Glove 2-pack"),
          bundle: { available: 3, components: [{ variantId: "gid://shopify/ProductVariant/1", quantity: 2 }] }
        },
        // Untracked items, such as gift cards, aren't ordered.
        { ...shopifyStock.rows[0], variantId: "gid://shopify/ProductVariant/4", productId: "gid://shopify/Product/12" },
        // Nor are Shopify Collective items, which a partner stocks and ships.
        {
          ...tracked(6, "gid://shopify/Product/14", "Partner shoe"),
          levels: [
            {
              locationId: "gid://shopify/Location/9",
              locationName: "Partner via Shopify Collective",
              locationKind: "shopify_collective" as const,
              available: 4,
              onHand: 4,
              incoming: 0,
              committed: 0
            }
          ]
        }
      ]
    })
    // Products whose Supplier field in Shopify names one get that supplier when the metafields are copied, a new one if
    // it isn't one of the buyer's yet.
    const copied = (id: number, productId: string, supplierName: string) => ({
      variantId: `gid://shopify/ProductVariant/${id}`,
      productId,
      supplierSku: null,
      asin: null,
      amazonStockTarget: null,
      storeStockTarget: null,
      caseQuantity: null,
      supplierName
    })
    provider.api.metafieldValues.mockResolvedValue([
      copied(7, "gid://shopify/Product/15", "Fence With Fun"),
      copied(8, "gid://shopify/Product/16", "Test Supplier Legal Name")
    ])
    await refreshShopify()
    await runNextJob()
    // The glove's first variant is on a PO to the test supplier, so the glove has a supplier.
    expect(await productsWithoutSupplier(buyerId)).toEqual([
      { productId: "gid://shopify/Product/11", title: "Cord", imageUrl: null, skus: ["sku-3"] },
      { productId: "gid://shopify/Product/13", title: "Mask", imageUrl: null, skus: ["sku-5"] }
    ])
    await assignProductSupplier(buyer, { productIds: ["gid://shopify/Product/13"], supplierId: supplierLinkId })
    expect((await productsWithoutSupplier(buyerId)).map((product) => product.title)).toEqual(["Cord"])
  })
  it("saves product defaults for synced products with revision checks", async () => {
    await shopifyStockAccount()
    const productId = "gid://shopify/Product/10"
    provider.api.stock.mockResolvedValue({ ...shopifyStock, rows: [{ ...shopifyStock.rows[0], productId }] })
    await refreshShopify()
    await runNextJob()
    const input = {
      productId,
      description: "  Cotton, size label inside  ",
      prepCategory: "TAPING",
      casePacks: [{ name: "Standard case", units: 24, lengthCm: 40, widthCm: 30, heightCm: 20, weightKg: null }],
      minimumOrder: 48,
      productLabel: "uploaded",
      expectedRevision: 0
    }
    expect(await saveProductDefaults(buyer, input)).toEqual({
      description: "Cotton, size label inside",
      prepCategory: "TAPING",
      casePacks: [{ name: "Standard case", units: 24, lengthCm: 40, widthCm: 30, heightCm: 20, weightKg: null }],
      caseQuantity: null,
      minimumOrder: 48,
      supplierId: null,
      productLabel: "uploaded",
      suffocationWarning: false,
      amazonNetwork: "fba",
      revision: 1
    })
    await expect(saveProductDefaults(buyer, input)).rejects.toThrow("Someone else changed")
    expect(
      await saveProductDefaults(buyer, { ...input, prepCategory: null, suffocationWarning: true, expectedRevision: 1 })
    ).toMatchObject({ prepCategory: null, suffocationWarning: true, revision: 2 })
    expect(await saveProductDefaults(buyer, { ...input, amazonNetwork: "awd_us", expectedRevision: 2 })).toMatchObject({
      amazonNetwork: "awd_us",
      revision: 3
    })
    // Left out, the warning and network settings are kept.
    expect(await saveProductDefaults(buyer, { ...input, prepCategory: null, expectedRevision: 3 })).toMatchObject({
      suffocationWarning: true,
      amazonNetwork: "awd_us",
      revision: 4
    })
    await expect(saveProductDefaults(buyer, { ...input, productId: "gid://shopify/Product/99" })).rejects.toThrow(
      "isn’t in your synced"
    )
    await expect(saveProductDefaults(supplier, input)).rejects.toThrow("buyer workspace")
    await expect(saveProductDefaults(actor("buyer", otherId), input)).rejects.toThrow("Connect Shopify")
    const defaultsFor = await lineDefaultsFor(buyerId)
    expect(
      defaultsFor({
        id: "gid://shopify/ProductVariant/1",
        title: "M",
        sku: "cord",
        product: { id: productId, title: "Cord" },
        inventoryItem: { id: "gid://shopify/InventoryItem/1", unitCost: null },
        supplierSku: null,
        asin: null,
        requiresComponents: false,
        productVariantComponents: { nodes: [], pageInfo: { hasNextPage: false } }
      })
    ).toEqual({
      piecesPerSet: 1,
      description: "Cotton, size label inside",
      prepCategory: null,
      suffocationWarning: true,
      amazonNetwork: "awd_us",
      skuLabel: true
    })
  })

  it("filters all Shopify location rows before pagination and binds cursors to that filter", async () => {
    await shopifyStockAccount()
    const location = (id: number) => ({
      locationId: `gid://shopify/Location/${id}`,
      locationName: `Warehouse ${id}`,
      available: id,
      onHand: id,
      incoming: 0,
      committed: 0
    })
    provider.api.stock.mockResolvedValue({
      ...shopifyStock,
      rows: [1, 2, 3].map((id) => ({
        ...shopifyStock.rows[0],
        variantId: `gid://shopify/ProductVariant/${id}`,
        levels: id === 1 ? [location(1)] : [location(1), location(2)]
      }))
    })
    await refreshShopify()
    await runNextJob()
    const base = "http://localhost/api/inventory?source=shopify&limit=1"
    const selected = `${base}&locationId=${encodeURIComponent("gid://shopify/Location/2")}`
    const first = await (await readInventory(new Request(selected))).json()
    expect(first.locations).toHaveLength(2)
    expect(first.rows[0].variantId).toBe("gid://shopify/ProductVariant/2")
    expect(first.rows[0].levels).toHaveLength(1)
    const second = await (await readInventory(new Request(`${selected}&cursor=${first.nextCursor}`))).json()
    expect(second.rows[0].variantId).toBe("gid://shopify/ProductVariant/3")
    expect(second.nextCursor).toBeNull()
    expect((await readInventory(new Request(`${base}&cursor=${first.nextCursor}`))).status).toBe(409)
    expect(
      (await readInventory(new Request(`${base}&locationId=${encodeURIComponent("gid://shopify/Location/99")}`))).status
    ).toBe(400)
    expect(
      (
        await readInventory(
          new Request("http://localhost/api/inventory?source=awd&locationId=gid%3A%2F%2Fshopify%2FLocation%2F2")
        )
      ).status
    ).toBe(400)
  })

  it("isolates Shopify and AWD scopes and deduplicates Shopify refreshes", async () => {
    await shopifyStockAccount()
    await stockAccount()
    const first = await refreshShopify()
    expect(first.status).toBe(202)
    expect(await (await refreshShopify()).json()).toEqual(await first.json())
    await refreshInventory(refreshRequest())
    expect(await database.select().from(tables.jobs)).toHaveLength(2)
    provider.api.awdStock.mockResolvedValue(stockData)
    await runNextJob()
    await runNextJob()
    expect(provider.shopifyFor).toHaveBeenCalledWith(buyerId, shopifyStock.shopifyDomain)
    const result = await (await readShopify()).json()
    expect(result).toMatchObject({
      source: "shopify",
      scopeKey: "store",
      rows: shopifyStock.rows,
      refresh: { status: "idle" }
    })
    expect((await (await readInventory(new Request("http://localhost/api/inventory?source=awd"))).json()).rows).toEqual(
      stockData.rows
    )
    signedIn.actor = actor("buyer", otherId)
    expect((await (await readShopify()).json()).snapshotId).toBeNull()
    expect((await refreshShopify()).status).toBe(409)
    signedIn.actor = supplier
    expect((await readShopify()).status).toBe(403)
    expect((await refreshShopify()).status).toBe(403)
  })

  it("preserves Shopify data when grants or token renewal fail", async () => {
    await shopifyStockAccount()
    await refreshShopify()
    await runNextJob()
    const previous = await (await readShopify()).json()
    provider.shopifyFor.mockRejectedValue(new Error("private expired grant"))
    await refreshShopify()
    await runNextJob()
    const result = await (await readShopify()).json()
    expect(result.snapshotId).toBe(previous.snapshotId)
    expect(result.rows).toEqual(previous.rows)
    expect(result.refresh).toMatchObject({ status: "failed", errorCode: "refresh_failed" })
    expect(JSON.stringify(result)).not.toContain("private expired grant")
  })

  it.each(["changed store", "wrong response", "lost ownership"])(
    "rejects Shopify publication for %s",
    async (reason) => {
      await shopifyStockAccount()
      provider.api.stock.mockImplementation(async () => {
        if (reason === "changed store") {
          await database
            .update(tables.connections)
            .set({ externalId: "replacement.myshopify.com" })
            .where(eq(tables.connections.orgId, buyerId))
        }
        if (reason === "lost ownership") {
          await database.update(tables.jobs).set({ attempts: 2 }).where(eq(tables.jobs.kind, "stock"))
        }
        return reason === "wrong response" ? { ...shopifyStock, shopifyDomain: "wrong.myshopify.com" } : shopifyStock
      })
      await refreshShopify()
      await runNextJob()
      const [stored] = await database.select().from(tables.stockSnapshots)
      expect(stored?.snapshotId).toBeNull()
      expect(stored?.data).toBeNull()
      expect(stored?.status).toBe(reason === "lost ownership" ? "running" : "failed")
      expect((await (await readShopify()).json()).rows).toEqual([])
    }
  )

  it("queues one tenant stock refresh, publishes complete data and paginates by snapshot", async () => {
    await stockAccount()
    const first = await refreshInventory(refreshRequest())
    expect(first.status).toBe(202)
    expect(await (await refreshInventory(refreshRequest())).json()).toEqual(await first.json())
    expect(await database.select().from(tables.jobs)).toHaveLength(1)
    provider.api.awdStock.mockResolvedValue(stockData)
    await runNextJob()
    expect(provider.amazonFor).toHaveBeenCalledWith(buyerId, "SELLER")
    const result = await (await readInventory(new Request("http://localhost/api/inventory?source=awd&limit=1"))).json()
    expect(result.rows).toEqual([stockData.rows[0]])
    expect(result.refresh.status).toBe("idle")
    expect(result.observedAt).toBe(stockData.observedAt)
    const second = await (
      await readInventory(new Request(`http://localhost/api/inventory?source=awd&cursor=${result.nextCursor}`))
    ).json()
    expect(second.rows).toEqual([stockData.rows[1]])
    expect(second.nextCursor).toBeNull()
    await refreshInventory(refreshRequest())
    await runNextJob()
    expect(
      (await readInventory(new Request(`http://localhost/api/inventory?source=awd&cursor=${result.nextCursor}`))).status
    ).toBe(409)
  })

  it("preserves the prior stock snapshot on provider failure", async () => {
    await stockAccount()
    provider.api.awdStock.mockResolvedValue(stockData)
    await refreshInventory(refreshRequest())
    await runNextJob()
    const [before] = await database.select().from(tables.stockSnapshots)
    provider.api.awdStock.mockRejectedValue(new Error("private provider diagnostic"))
    await refreshInventory(refreshRequest())
    await runNextJob()
    const response = await (await readInventory(new Request("http://localhost/api/inventory?source=awd"))).json()
    expect(response.snapshotId).toBe(before?.snapshotId)
    expect(response.rows).toEqual(stockData.rows)
    expect(response.refresh).toMatchObject({ status: "failed", errorCode: "refresh_failed" })
    expect(JSON.stringify(response)).not.toContain("private provider diagnostic")
  })

  it("tries a stock refresh again later when the provider is busy, keeping the prior snapshot", async () => {
    await stockAccount()
    provider.api.awdStock.mockResolvedValue(stockData)
    await refreshInventory(refreshRequest())
    await runNextJob()
    const [before] = await database.select().from(tables.stockSnapshots)
    provider.api.awdStock.mockRejectedValue(new ProviderError(503, "request", "busy"))
    await refreshInventory(refreshRequest())
    await runNextJob()
    const response = await (await readInventory(new Request("http://localhost/api/inventory?source=awd"))).json()
    expect(response.snapshotId).toBe(before?.snapshotId)
    expect(response.refresh).toMatchObject({ status: "queued", errorCode: null })
    const [job] = await database
      .select()
      .from(tables.jobs)
      .where(and(eq(tables.jobs.kind, "stock"), eq(tables.jobs.status, "pending")))
    expect(job?.runAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60000)
  })

  it("rejects publication after the seller account changes and hides old account stock", async () => {
    await stockAccount()
    provider.api.awdStock.mockImplementation(async () => {
      await database
        .update(tables.connections)
        .set({ externalId: "REPLACEMENT" })
        .where(eq(tables.connections.orgId, buyerId))
      return stockData
    })
    await refreshInventory(refreshRequest())
    await runNextJob()
    const [stored] = await database.select().from(tables.stockSnapshots)
    expect(stored?.data).toBeNull()
    expect(stored?.status).toBe("failed")
    const result = await (await readInventory(new Request("http://localhost/api/inventory?source=awd"))).json()
    expect(result.externalAccountId).toBe("REPLACEMENT")
    expect(result.snapshotId).toBeNull()
    expect(result.rows).toEqual([])
  })

  it("cannot publish or mark failure after losing job ownership", async () => {
    await stockAccount()
    await refreshInventory(refreshRequest())
    provider.api.awdStock.mockImplementation(async () => {
      await database.update(tables.jobs).set({ attempts: 2 }).where(eq(tables.jobs.kind, "stock"))
      return stockData
    })
    await runNextJob()
    const [stored] = await database.select().from(tables.stockSnapshots)
    expect(stored?.data).toBeNull()
    expect(stored?.status).toBe("running")
  })

  it("denies supplier refresh/read and returns unknown for an unconnected buyer", async () => {
    signedIn.actor = supplier
    expect((await refreshInventory(refreshRequest())).status).toBe(403)
    expect((await readInventory(new Request("http://localhost/api/inventory?source=awd"))).status).toBe(403)
    signedIn.actor = buyer
    expect((await refreshInventory(refreshRequest())).status).toBe(409)
    const response = await (await readInventory(new Request("http://localhost/api/inventory?source=awd"))).json()
    expect(response).toMatchObject({
      snapshotId: null,
      observedAt: null,
      rows: [],
      refresh: { errorCode: "not_connected" }
    })
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
  })

  it("does not expose another buyer's snapshot even with its cursor", async () => {
    await stockAccount()
    provider.api.awdStock.mockResolvedValue(stockData)
    await refreshInventory(refreshRequest())
    await runNextJob()
    const response = await (
      await readInventory(new Request("http://localhost/api/inventory?source=awd&limit=1"))
    ).json()
    signedIn.actor = actor("buyer", otherId)
    const unrelated = await (await readInventory(new Request("http://localhost/api/inventory?source=awd"))).json()
    expect(unrelated.rows).toEqual([])
    expect(
      (await readInventory(new Request(`http://localhost/api/inventory?source=awd&cursor=${response.nextCursor}`)))
        .status
    ).toBe(409)
  })
})

describe("product suppliers", () => {
  beforeEach(orderConnections)
  it("assigns a current supplier to several products in Copacker, and keeps their other details", async () => {
    const products = ["gid://shopify/Product/1", "gid://shopify/Product/2"]
    provider.shopifyFor.mockResolvedValue(provider.api)
    expect(await assignProductSupplier(buyer, { productIds: products, supplierId: supplierLinkId })).toEqual({
      updated: 2
    })
    // Nothing is written to Shopify.
    expect(provider.api.graphql).not.toHaveBeenCalled()
    const saved = await readProductDefaults(buyerId, "test.myshopify.com")
    expect(saved.get(products[0]!)).toMatchObject({ supplierId: supplierLinkId, revision: 1, description: "" })
    await assignProductSupplier(buyer, { productIds: [products[0]!], supplierId: null })
    expect((await readProductDefaults(buyerId, "test.myshopify.com")).get(products[0]!)).toMatchObject({
      supplierId: null,
      revision: 2
    })
    await expect(assignProductSupplier(buyer, { productIds: products, supplierId: randomUUID() })).rejects.toThrow(
      "current suppliers"
    )
    await database
      .update(tables.suppliers)
      .set({ removedAt: new Date() })
      .where(eq(tables.suppliers.id, supplierLinkId))
    await expect(assignProductSupplier(buyer, { productIds: products, supplierId: supplierLinkId })).rejects.toThrow(
      "current suppliers"
    )
    await expect(assignProductSupplier(supplier, { productIds: products, supplierId: null })).rejects.toThrow(
      "buyer workspace"
    )
  })
})
