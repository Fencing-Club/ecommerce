import { randomUUID } from "node:crypto"
import { orderTotal } from "@repo/copacker-orders"
import { eq } from "drizzle-orm"
import { PDFDocument } from "pdf-lib"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { POST as uploadImportHandler } from "../../src/server/http/api/imports"
import {
  GET as getImport,
  DELETE as cancelImport,
  POST as retryImport,
  PATCH as patchImport
} from "../../src/server/http/api/imports/$id"
import { GET as searchImportCatalog } from "../../src/server/http/api/imports/$id/catalog"
import { importJob } from "../../src/server/import-job"
import { saveImportedOrder } from "../../src/server/import-save"
import { provider, storage } from "../mocks/providers"
import { served } from "../served"
import { database } from "../test-db"
import { signedIn } from "../test-session"
import {
  actor,
  buyer,
  buyerId,
  orderConnections,
  orderData,
  otherId,
  preparation,
  reviewedImport,
  setUpWorkflowTests
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

const uploadImport = served(uploadImportHandler)

describe("reviewed import save", () => {
  beforeEach(orderConnections)
  it.each(["missing", "other_workspace", "removed"] as const)(
    "rejects a stop at a %s forwarder without saving a draft",
    async (scenario) => {
      const imported = await reviewedImport()
      const forwarderId = randomUUID()
      const addressId = randomUUID()
      if (scenario !== "missing") {
        const { packing } = await preparation()
        const owner = scenario === "other_workspace" ? otherId : buyerId
        await database.insert(tables.forwarders).values({
          id: forwarderId,
          buyerOrgId: owner,
          name: "Forwarder",
          removedAt: scenario === "removed" ? new Date() : null
        })
        await database.insert(tables.contacts).values({
          id: addressId,
          orgId: owner,
          kind: "forwarder",
          forwarderId,
          name: "Warehouse",
          address: packing.origin
        })
      }
      await expect(
        saveImportedOrder(buyer, imported.id, { ...imported.input, via: { forwarderId, addressId } })
      ).rejects.toThrow("forwarders’ addresses")
      expect(await database.select().from(tables.orders)).toHaveLength(1)
      expect((await database.select().from(tables.poImports))[0]).toMatchObject({ status: "review", orderId: null })
      expect(await database.select().from(tables.jobs)).toHaveLength(0)
    }
  )
  it("saves a stop at an owned forwarder on a draft without email or shipment jobs", async () => {
    const imported = await reviewedImport()
    const { packing } = await preparation()
    const [forwarder] = await database
      .insert(tables.forwarders)
      .values({ buyerOrgId: buyerId, name: "Forwarder" })
      .returning()
    const [contact] = await database
      .insert(tables.contacts)
      .values({
        orgId: buyerId,
        kind: "forwarder",
        forwarderId: forwarder!.id,
        name: "Warehouse",
        address: packing.origin
      })
      .returning()
    const via = { forwarderId: forwarder!.id, addressId: contact!.id }
    const saved = await saveImportedOrder(buyer, imported.id, { ...imported.input, via })
    const [order] = await database.select().from(tables.orders).where(eq(tables.orders.id, saved.id))
    expect(order).toMatchObject({
      status: "draft",
      data: { items: [expect.objectContaining({ receiver: "fba" })], via }
    })
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    expect(
      (await database.select().from(tables.shipments)).filter((shipment) => shipment.orderId === saved.id)
    ).toHaveLength(0)
  })
  it.each(["shopify", "amazon"] as const)(
    "rejects %s account changes during catalog resolution without saving",
    async (kind) => {
      const imported = await reviewedImport()
      provider.api.listings.mockImplementationOnce(async () => {
        const [account] = await database.select().from(tables.connections).where(eq(tables.connections.provider, kind))
        await database
          .update(tables.connections)
          .set({ externalId: "replacement-account" })
          .where(eq(tables.connections.id, account!.id))
        return new Map([["foil-2", { asin: "B000000001", fnsku: "X000000001" }]])
      })
      await expect(saveImportedOrder(buyer, imported.id, imported.input)).rejects.toThrow("merchant account changed")
      expect(await database.select().from(tables.orders)).toHaveLength(1)
      expect(await database.select().from(tables.orderRevisions)).toHaveLength(1)
      expect(await database.select().from(tables.jobs)).toHaveLength(0)
      expect((await database.select().from(tables.poImports))[0]).toMatchObject({
        status: "review",
        orderId: null,
        revision: 1
      })
    }
  )
  it("rejects removed connections even if another tenant retains matching accounts", async () => {
    const imported = await reviewedImport()
    provider.api.listings.mockImplementationOnce(async () => {
      await database.update(tables.connections).set({ orgId: otherId })
      return new Map([["foil-2", { asin: "B000000001", fnsku: "X000000001" }]])
    })
    await expect(saveImportedOrder(buyer, imported.id, imported.input)).rejects.toThrow("merchant account changed")
    expect(await database.select().from(tables.orders)).toHaveLength(1)
    expect((await database.select().from(tables.poImports))[0]?.status).toBe("review")
  })
  it("starts each line with its product's saved defaults and Amazon network, at the document's quantity and price", async () => {
    const imported = await reviewedImport()
    await database.insert(tables.productDefaults).values({
      orgId: buyerId,
      shopifyDomain: "test.myshopify.com",
      productId: "gid://shopify/Product/1",
      description: "Coil each cord",
      prepCategory: "NO_PREP",
      suffocationWarning: true,
      amazonNetwork: "awd_us"
    })
    const saved = await saveImportedOrder(buyer, imported.id, imported.input)
    const [order] = await database.select().from(tables.orders).where(eq(tables.orders.id, saved.id))
    expect(order?.data.items).toMatchObject([
      {
        receiver: "awd_us",
        instructions: "Coil each cord",
        prepCategory: "NO_PREP",
        suffocationWarning: true,
        pieces: 160,
        piecesPerSet: 2,
        unitPrice: 408
      }
    ])
  })
  it("saves reviewed per-set pricing as individual pieces and preserves signed charges", async () => {
    const imported = await reviewedImport()
    const item = imported.proposal.items[0]!
    item.sourceQuantity = 80
    item.sourceUnit = "sets"
    item.sourceUnitPrice = "8.16"
    imported.proposal.adjustments.push({ description: "Supplier discount", amount: "-10.00", sourcePage: 1 })
    imported.proposal.documentTotal = "655.60"
    await database
      .update(tables.poImports)
      .set({ proposal: imported.proposal })
      .where(eq(tables.poImports.id, imported.id))
    const saved = await saveImportedOrder(buyer, imported.id, imported.input)
    const [order] = await database.select().from(tables.orders).where(eq(tables.orders.id, saved.id))
    expect(order?.data.items[0]).toMatchObject({ pieces: 160, piecesPerSet: 2, unitPrice: 408 })
    expect(order?.data.adjustments).toEqual([
      { description: "Packing", amount: 1280 },
      { description: "Supplier discount", amount: -1000 }
    ])
    expect(orderTotal(order!.data)).toBe(65560)
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
  })
  it.each([
    {
      name: "unresolved mixed currency",
      error: "Confirm the document currency",
      edit: (p: Awaited<ReturnType<typeof reviewedImport>>["proposal"]) => {
        p.currency = null
      }
    },
    {
      name: "unknown additional charge",
      error: "Confirm every additional charge",
      edit: (p: Awaited<ReturnType<typeof reviewedImport>>["proposal"]) => {
        p.adjustments[0]!.amount = null
      }
    },
    {
      name: "fractional-cent conversion",
      error: "up to 2 decimal places",
      edit: (p: Awaited<ReturnType<typeof reviewedImport>>["proposal"]) => {
        p.items[0]!.pricePerPiece = "4.085"
      }
    },
    {
      name: "incorrect set conversion",
      error: "Line 1 total differs",
      edit: (p: Awaited<ReturnType<typeof reviewedImport>>["proposal"]) => {
        p.items[0]!.pieces = 80
      }
    },
    {
      name: "incorrect source line total despite a matching document total",
      error: "Line 1 total differs",
      edit: (p: Awaited<ReturnType<typeof reviewedImport>>["proposal"]) => {
        p.items[0]!.sourceLineTotal = "652.79"
      }
    }
  ])("rejects $name before catalog access or persistence", async ({ edit, error }) => {
    const imported = await reviewedImport()
    edit(imported.proposal)
    await database
      .update(tables.poImports)
      .set({ proposal: imported.proposal })
      .where(eq(tables.poImports.id, imported.id))
    await expect(saveImportedOrder(buyer, imported.id, imported.input)).rejects.toThrow(error)
    expect(provider.connection).not.toHaveBeenCalled()
    expect(await database.select().from(tables.orders)).toHaveLength(1)
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    const [unchanged] = await database.select().from(tables.poImports).where(eq(tables.poImports.id, imported.id))
    expect(unchanged).toMatchObject({ status: "review", revision: 1, orderId: null })
  })
  it("saves one draft with adjustments and repeats safely without provider access or jobs", async () => {
    const imported = await reviewedImport()
    const saved = await saveImportedOrder(buyer, imported.id, imported.input)
    provider.connection.mockRejectedValue(new Error("Provider unavailable"))
    expect(await saveImportedOrder(buyer, imported.id, imported.input)).toEqual(saved)
    const [order] = await database.select().from(tables.orders).where(eq(tables.orders.id, saved.id))
    expect(order?.status).toBe("draft")
    expect(order?.data.items[0]?.name).toBe("Verified foil cord")
    expect(order?.data.adjustments).toEqual([{ description: "Packing", amount: 1280 }])
    expect(orderTotal(order!.data)).toBe(66560)
    expect(await database.select().from(tables.orders)).toHaveLength(2)
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    expect(await database.select().from(tables.shipments)).toHaveLength(0)
  })
  it("rejects another organization and stale review revisions", async () => {
    const imported = await reviewedImport()
    await expect(saveImportedOrder(actor("buyer", otherId), imported.id, imported.input)).rejects.toThrow("not found")
    await expect(saveImportedOrder(buyer, imported.id, { ...imported.input, revision: 2 })).rejects.toThrow("changed")
    expect(provider.connection).not.toHaveBeenCalled()
  })
  it("requires resolved matches and reconciled totals", async () => {
    const imported = await reviewedImport()
    imported.proposal.items[0]!.selectedVariantId = null
    await database
      .update(tables.poImports)
      .set({ proposal: imported.proposal })
      .where(eq(tables.poImports.id, imported.id))
    await expect(saveImportedOrder(buyer, imported.id, imported.input)).rejects.toThrow("Resolve the product")
    imported.proposal.items[0]!.selectedVariantId = orderData.items[0]!.variantId
    imported.proposal.documentTotal = "1.00"
    await database
      .update(tables.poImports)
      .set({ proposal: imported.proposal })
      .where(eq(tables.poImports.id, imported.id))
    await expect(saveImportedOrder(buyer, imported.id, imported.input)).rejects.toThrow("Document total differs")
  })
  it("rejects changed merchant connections without persisting a PO", async () => {
    const imported = await reviewedImport()
    await database
      .update(tables.poImports)
      .set({ shopifyDomain: "other.myshopify.com" })
      .where(eq(tables.poImports.id, imported.id))
    await expect(saveImportedOrder(buyer, imported.id, imported.input)).rejects.toThrow("merchant account changed")
    expect(await database.select().from(tables.orders)).toHaveLength(1)
  })
  it("catches edits made while catalog lookups are in progress", async () => {
    const imported = await reviewedImport()
    provider.api.listings.mockImplementation(async () => {
      await database.update(tables.poImports).set({ revision: 2 }).where(eq(tables.poImports.id, imported.id))
      return new Map([["foil-2", { asin: "B000000001", fnsku: "X000000001" }]])
    })
    await expect(saveImportedOrder(buyer, imported.id, imported.input)).rejects.toThrow("changed")
    expect(await database.select().from(tables.orders)).toHaveLength(1)
  })
})

describe("import review", () => {
  it("scopes review catalog search to the import store and reports remaining pages", async () => {
    const imported = await reviewedImport()
    const variant = {
      id: "gid://shopify/ProductVariant/1",
      sku: "buyer-1",
      title: "Small",
      product: { title: "Jacket" },
      supplierSku: { value: "SUPPLIER-1" }
    }
    provider.shopifyFor.mockResolvedValue({
      catalogPage: async () => ({ nodes: [variant], pageInfo: { hasNextPage: true, endCursor: "next" } })
    })
    const params = { params: { id: imported.id } }
    const request = new Request(`http://localhost/api/imports/${imported.id}/catalog?q=supplier-1`)
    const response = await searchImportCatalog(request, params)
    expect(await response.json()).toEqual({ results: [variant], nextCursor: "next", complete: false })
    expect(provider.shopifyFor).toHaveBeenCalledWith(buyerId, "test.myshopify.com")
    provider.shopifyFor.mockClear()
    signedIn.actor = actor("buyer", otherId)
    expect((await searchImportCatalog(request, params)).status).toBe(404)
    expect(provider.shopifyFor).not.toHaveBeenCalled()
  })
  it("rejects stale review edits before catalog access and handles invalid JSON", async () => {
    const imported = await reviewedImport()
    const origin = process.env.APP_URL ?? "http://localhost:3000"
    const params = { params: { id: imported.id } }
    const request = (body: string) =>
      new Request(`${origin}/api/imports/${imported.id}`, { method: "PATCH", headers: { origin }, body })
    expect(
      (await patchImport(request(JSON.stringify({ revision: 2, proposal: imported.proposal })), params)).status
    ).toBe(409)
    expect((await patchImport(request("{"), params)).status).toBe(400)
    expect(provider.shopifyFor).not.toHaveBeenCalled()
  })
  it("keeps review corrections unchanged when catalog verification is unavailable", async () => {
    const imported = await reviewedImport()
    provider.shopifyFor.mockRejectedValue(new Error("Private provider diagnostics"))
    const origin = process.env.APP_URL ?? "http://localhost:3000"
    const response = await patchImport(
      new Request(`${origin}/api/imports/${imported.id}`, {
        method: "PATCH",
        headers: { origin },
        body: JSON.stringify({ revision: 1, proposal: imported.proposal })
      }),
      { params: { id: imported.id } }
    )
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("Private provider diagnostics")
    expect((await database.select().from(tables.poImports))[0]).toMatchObject({
      revision: 1,
      proposal: imported.proposal
    })
  })
  it("isolates AI imports and never returns private source keys", async () => {
    const id = randomUUID()
    await database.insert(tables.poImports).values({
      id,
      orgId: buyerId,
      createdBy: buyer.user.id,
      objectKey: `private/${id}`,
      filename: "invoice.pdf",
      shopifyDomain: "test.myshopify.com"
    })
    const params = { params: { id } }
    const own = await getImport(new Request(`http://localhost/api/imports/${id}`), params)
    expect(own.status).toBe(200)
    expect(await own.json()).not.toHaveProperty("objectKey")
    signedIn.actor = actor("buyer", otherId)
    expect((await getImport(new Request(`http://localhost/api/imports/${id}`), params)).status).toBe(404)
  })
  it("cancels import revisions and retries failures only once", async () => {
    const id = randomUUID()
    await database.insert(tables.poImports).values({
      id,
      orgId: buyerId,
      createdBy: buyer.user.id,
      objectKey: `private/${id}`,
      filename: "invoice.pdf",
      shopifyDomain: "test.myshopify.com",
      status: "failed",
      promptVersion: 1
    })
    const params = { params: { id } }
    const origin = process.env.APP_URL ?? "http://localhost:3000"
    const request = () => new Request(`${origin}/api/imports/${id}`, { method: "POST", headers: { origin } })
    expect((await retryImport(request(), params)).status).toBe(202)
    expect((await database.select().from(tables.poImports))[0]?.promptVersion).toBeNull()
    expect((await retryImport(request(), params)).status).toBe(409)
    expect(await database.select().from(tables.jobs)).toHaveLength(1)
    expect((await cancelImport(request(), params)).status).toBe(200)
    const [record] = await database.select().from(tables.poImports)
    expect(record?.status).toBe("cancelled")
    expect(record?.revision).toBe(3)
    expect((await retryImport(request(), params)).status).toBe(409)
  })
})

describe("import worker", () => {
  async function setup() {
    const imported = await reviewedImport()
    await database
      .update(tables.poImports)
      .set({ status: "queued", proposal: null })
      .where(eq(tables.poImports.id, imported.id))
    vi.stubEnv("LANGFUSE_BASE_URL", "https://langfuse.example")
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "test-public")
    vi.stubEnv("LANGFUSE_SECRET_KEY", "test-secret")
    vi.stubEnv("OPENROUTER_API_KEY", "test-key")
    storage.getFile.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const variant = {
      id: orderData.items[0]!.variantId,
      sku: "foil-2",
      supplierSku: { value: "supplier-1" },
      title: "Two-pack",
      product: { title: "Foil cord" }
    }
    const catalogPage = vi
      .fn<
        () => Promise<{ nodes: Array<typeof variant>; pageInfo: { hasNextPage: boolean; endCursor: string | null } }>
      >()
      .mockResolvedValue({ nodes: [variant], pageInfo: { hasNextPage: false, endCursor: null } })
    provider.shopifyFor.mockResolvedValue({
      catalogPage,
      variants: vi.fn<() => Promise<Array<typeof variant>>>().mockResolvedValue([variant])
    })
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ prompt: "Test import prompt", version: 7 }))
    vi.stubGlobal("fetch", fetcher)
    const record = async () =>
      (await database.select().from(tables.poImports).where(eq(tables.poImports.id, imported.id)))[0]!
    return { ...imported, fetcher, catalogPage, record }
  }
  function call(name: string, args: unknown) {
    return Response.json({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ id: randomUUID(), type: "function", function: { name, arguments: JSON.stringify(args) } }]
          }
        }
      ],
      usage: { total_tokens: 100 }
    })
  }
  it("uses pinned tenant accounts and supplier SKU matching, retaining prompt version and usage", async () => {
    const t = await setup()
    t.fetcher
      .mockResolvedValueOnce(call("search_shopify_products", { queries: ["supplier-1"] }))
      .mockResolvedValueOnce(call("get_shopify_variants", { ids: [orderData.items[0]!.variantId] }))
      .mockResolvedValueOnce(call("search_amazon_listings", { skus: ["foil-2"] }))
      .mockResolvedValueOnce(call("finish_import", t.proposal))
    await importJob({ id: t.id, revision: 1 }, { assertOwned: async () => Promise.resolve() })
    expect(provider.shopifyFor).toHaveBeenCalledWith(buyerId, "test.myshopify.com")
    expect(provider.amazonFor).toHaveBeenCalledWith(buyerId, "A123456789")
    expect(storage.getFile).toHaveBeenCalledWith(`imports/${t.id}`)
    expect(await t.record()).toMatchObject({ status: "review", promptVersion: 7, tokens: 400, proposal: t.proposal })
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    expect(await database.select().from(tables.orders)).toHaveLength(1)
  })
  it("rejects model attempts to choose another account before a catalog call", async () => {
    const t = await setup()
    t.fetcher.mockResolvedValueOnce(call("search_shopify_products", { queries: ["cord"], orgId: otherId }))
    await expect(importJob({ id: t.id, revision: 1 }, { assertOwned: async () => Promise.resolve() })).rejects.toThrow(
      "Unrecognized key"
    )
    expect(t.catalogPage).not.toHaveBeenCalled()
    expect(await t.record()).toMatchObject({ status: "failed", proposal: null })
  })
  it("matches multiple document SKUs in one lookup without repeating full catalog records", async () => {
    const t = await setup()
    t.fetcher
      .mockResolvedValueOnce(call("search_shopify_products", { queries: ["supplier-1", "foil-2", "missing"] }))
      .mockImplementationOnce(async (_url, init) => {
        const sent = JSON.parse(String(init?.body))
        const result = JSON.parse(sent.messages.at(-1).content)
        expect(result.searches.map((search: { results: unknown[] }) => search.results.length)).toEqual([1, 1, 0])
        expect(result.searches[0].results[0]).toMatchObject({
          id: orderData.items[0]!.variantId,
          sku: "foil-2",
          supplierSku: "supplier-1",
          product: "Foil cord",
          variant: "Two-pack"
        })
        expect(result.searches[0].results[0]).not.toHaveProperty("inventoryItem")
        return call("finish_import", t.proposal)
      })
    await importJob({ id: t.id, revision: 1 }, { assertOwned: async () => Promise.resolve() })
    expect(t.catalogPage).toHaveBeenCalledTimes(1)
    expect(await t.record()).toMatchObject({ status: "review" })
  })
  it("does not resurrect a cancelled import when a provider response arrives late", async () => {
    const t = await setup()
    t.fetcher.mockImplementationOnce(async () => {
      await database
        .update(tables.poImports)
        .set({ status: "cancelled", revision: 2 })
        .where(eq(tables.poImports.id, t.id))
      return call("search_shopify_products", { queries: ["cord"] })
    })
    await expect(importJob({ id: t.id, revision: 1 }, { assertOwned: async () => Promise.resolve() })).rejects.toThrow(
      "cancelled"
    )
    expect(await t.record()).toMatchObject({ status: "cancelled", revision: 2, proposal: null })
    expect(t.catalogPage).not.toHaveBeenCalled()
  })
  it("resumes the pinned prompt and ignores obsolete job revisions", async () => {
    const t = await setup()
    await importJob({ id: t.id, revision: 2 }, { assertOwned: async () => Promise.resolve() })
    expect(t.fetcher).not.toHaveBeenCalled()
    await database.update(tables.poImports).set({ promptVersion: 7 }).where(eq(tables.poImports.id, t.id))
    t.fetcher
      .mockResolvedValueOnce(call("search_shopify_products", { queries: ["foil-2"] }))
      .mockResolvedValueOnce(call("finish_import", t.proposal))
    await importJob({ id: t.id, revision: 1 }, { assertOwned: async () => Promise.resolve() })
    expect(t.fetcher.mock.calls[0]![0]).toBe(
      "https://langfuse.example/api/public/v2/prompts/purchase-order-import?version=7"
    )
    expect(await t.record()).toMatchObject({ status: "review" })
  })
  it("fails a stalled catalog cursor instead of looping or accepting incomplete identities", async () => {
    const t = await setup()
    t.catalogPage.mockResolvedValue({ nodes: [], pageInfo: { hasNextPage: true, endCursor: null } })
    t.fetcher.mockResolvedValueOnce(call("search_shopify_products", { queries: ["cord"] }))
    await expect(importJob({ id: t.id, revision: 1 }, { assertOwned: async () => Promise.resolve() })).rejects.toThrow(
      "pagination"
    )
    expect(t.catalogPage).toHaveBeenCalledTimes(1)
    expect(await t.record()).toMatchObject({ status: "failed", proposal: null })
  })
  it("keeps exact and duplicate supplier SKU matches ahead of truncated text matches", async () => {
    const t = await setup()
    const variants = Array.from({ length: 35 }, (_, index) => ({
      id: `gid://shopify/ProductVariant/${index + 10}`,
      sku: `other-${index}`,
      supplierSku: { value: `unrelated-${index}` },
      title: "Size",
      product: { title: "supplier-1 matching description" }
    }))
    const exact = [
      { ...variants[0]!, id: orderData.items[0]!.variantId, supplierSku: { value: "supplier-1" } },
      { ...variants[1]!, id: "gid://shopify/ProductVariant/2", supplierSku: { value: "SUPPLIER-1" } }
    ]
    t.catalogPage.mockResolvedValue({
      nodes: [...variants, ...exact],
      pageInfo: { hasNextPage: false, endCursor: null }
    })
    t.fetcher
      .mockResolvedValueOnce(call("search_shopify_products", { queries: ["supplier-1"] }))
      .mockImplementationOnce(async (_url, init) => {
        const sent = JSON.parse(String(init?.body))
        const results = JSON.parse(sent.messages.at(-1).content)
        expect(results.searches[0].results.slice(0, 2).map((v: { id: string }) => v.id)).toEqual(exact.map((v) => v.id))
        expect(results.searches[0].matchesTruncated).toBe(true)
        expect(results.catalogComplete).toBe(true)
        return call("finish_import", t.proposal)
      })
    await importJob({ id: t.id, revision: 1 }, { assertOwned: async () => Promise.resolve() })
    expect(await t.record()).toMatchObject({ status: "review" })
  })
  it("leaves state untouched after the worker loses its lease", async () => {
    const t = await setup()
    const lease = vi.fn<() => Promise<void>>(async () => {
      throw new Error("Lease lost")
    })
    await expect(importJob({ id: t.id, revision: 1 }, { assertOwned: lease })).rejects.toThrow("Lease lost")
    expect(t.fetcher).not.toHaveBeenCalled()
    expect(await t.record()).toMatchObject({ status: "queued", proposal: null })
  })
  it("warns when matching stops before the entire catalog has been searched", async () => {
    const t = await setup()
    let page = 0
    t.catalogPage.mockImplementation(async () => ({
      nodes: [
        {
          id: orderData.items[0]!.variantId,
          sku: "foil-2",
          supplierSku: { value: "supplier-1" },
          title: "Two-pack",
          product: { title: "Foil cord" }
        }
      ],
      pageInfo: { hasNextPage: true, endCursor: `page-${++page}` }
    }))
    t.fetcher
      .mockResolvedValueOnce(call("search_shopify_products", { queries: ["foil-2"] }))
      .mockResolvedValueOnce(call("finish_import", t.proposal))
    await importJob({ id: t.id, revision: 1 }, { assertOwned: async () => Promise.resolve() })
    expect(t.catalogPage).toHaveBeenCalledTimes(5)
    expect((await t.record()).proposal?.warnings).toContain(
      "Catalog search was incomplete. Review matches before saving."
    )
  })
})

describe("import source upload", () => {
  async function request() {
    vi.stubEnv("OPENROUTER_API_KEY", "test")
    vi.stubEnv("LANGFUSE_SECRET_KEY", "test")
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "test")
    vi.stubEnv("LANGFUSE_BASE_URL", "https://langfuse.example")
    await database
      .insert(tables.connections)
      .values({ orgId: buyerId, provider: "shopify", externalId: "test.myshopify.com", encryptedToken: "test" })
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const form = new FormData()
    form.set("file", new File([Buffer.from(await pdf.save())], "invoice.pdf", { type: "application/pdf" }))
    const origin = process.env.APP_URL ?? "http://localhost:3000"
    return new Request(`${origin}/api/imports`, { method: "POST", headers: { origin }, body: form })
  }
  it("queues an import only after its private PDF is stored", async () => {
    const req = await request()
    storage.putFile.mockImplementation(async () => {
      expect(await database.select().from(tables.poImports)).toHaveLength(0)
      expect(await database.select().from(tables.jobs)).toHaveLength(0)
    })
    const response = await uploadImport(req)
    expect(response.status).toBe(202)
    const body = await response.json()
    const [record] = await database.select().from(tables.poImports)
    expect(record).toMatchObject({ id: body.id, status: "queued", orgId: buyerId, shopifyDomain: "test.myshopify.com" })
    expect(storage.putFile).toHaveBeenCalledWith(`${buyerId}/imports/${body.id}/source.pdf`, expect.any(Uint8Array))
    const [job] = await database.select().from(tables.jobs)
    expect(job).toMatchObject({ kind: "import", payload: { id: body.id, revision: 1 } })
  })
  it("does not expose a retryable import when source storage fails", async () => {
    const req = await request()
    storage.putFile.mockRejectedValue(new Error("Storage unavailable"))
    // An unexpected failure goes on to Start, which logs it and answers 500.
    await expect(uploadImport(req)).rejects.toThrow("Storage unavailable")
    expect(await database.select().from(tables.poImports)).toHaveLength(0)
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
  })
  it("checks the complete prompt configuration before storing the source", async () => {
    const req = await request()
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "")
    await expect(uploadImport(req)).rejects.toThrow("AI import is not configured")
    expect(storage.putFile).not.toHaveBeenCalled()
    expect(await database.select().from(tables.poImports)).toHaveLength(0)
  })
})
