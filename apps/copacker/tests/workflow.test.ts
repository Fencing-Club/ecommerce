import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { orderInputSchema, packingSchema, buildAwdRequest, orderTotal } from "@repo/aisle"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { PDFDocument } from "pdf-lib"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/auth"

const provider = vi.hoisted(() => ({
  amazonFor: vi.fn<(...args: never[]) => Promise<unknown>>(),
  shopifyFor: vi.fn<(...args: never[]) => Promise<unknown>>(),
  connection: vi.fn<(...args: never[]) => Promise<unknown>>(),
  api: {
    graphql: vi.fn<(...args: never[]) => Promise<unknown>>(),
    request: vi.fn<(...args: never[]) => Promise<unknown>>(),
    report: vi.fn<(...args: never[]) => Promise<unknown>>(),
    eligibility: vi.fn<(...args: never[]) => Promise<unknown>>(),
    create: vi.fn<(...args: never[]) => Promise<unknown>>(),
    order: vi.fn<(...args: never[]) => Promise<unknown>>(),
    confirm: vi.fn<(...args: never[]) => Promise<unknown>>(),
    labels: vi.fn<(...args: never[]) => Promise<unknown>>(),
    listings: vi.fn<(...args: never[]) => Promise<unknown>>(),
    stock: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaStock: vi.fn<(...args: never[]) => Promise<unknown>>(),
    awdStock: vi.fn<(...args: never[]) => Promise<unknown>>()
  }
}))
vi.mock("../src/server/connections", () => ({
  amazonFor: provider.amazonFor,
  shopifyFor: provider.shopifyFor,
  connection: provider.connection
}))
const storage = vi.hoisted(() => ({
  putFile: vi.fn<(...args: never[]) => Promise<void>>(),
  getFile: vi.fn<(...args: never[]) => Promise<Uint8Array>>()
}))
vi.mock("../src/server/storage", async (original) => ({
  ...(await original<typeof import("../src/server/storage")>()),
  putFile: storage.putFile,
  getFile: storage.getFile
}))
const context = vi.hoisted(() => ({ current: null as unknown, actor: null as Session | null }))
vi.mock("../src/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => context.actor
}))
vi.mock("@/db", () => ({ db: () => context.current }))
vi.mock("../src/server/import-trace", async (original) => ({
  ...(await original<typeof import("../src/server/import-trace")>()),
  traceImport: async () => true
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found")
  },
  redirect: () => {
    throw new Error("redirect")
  }
}))
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn<() => void>() }))
import { POST as action } from "../src/app/api/action/route"
import { GET as downloadDocument } from "../src/app/api/documents/[id]/route"
import { POST as upload } from "../src/app/api/documents/route"
import { GET as searchImportCatalog } from "../src/app/api/imports/[id]/catalog/route"
import {
  GET as getImport,
  DELETE as cancelImport,
  POST as retryImport,
  PATCH as patchImport
} from "../src/app/api/imports/[id]/route"
import { GET as downloadImportSource } from "../src/app/api/imports/[id]/source/route"
import { POST as uploadImport } from "../src/app/api/imports/route"
import { POST as readDemand } from "../src/app/api/inventory/demand/route"
import { GET as readLocations, PATCH as patchLocation } from "../src/app/api/inventory/locations/route"
import { POST as refreshInventory } from "../src/app/api/inventory/refresh/route"
import { GET as readInventory } from "../src/app/api/inventory/route"
import { GET as getCoverage } from "../src/app/api/orders/summary/route"
import { GET as downloadPacket } from "../src/app/api/shipments/[id]/packet/route"
import { accessibleOrder } from "../src/server/access"
import { generateShipmentDocuments, storeDocument } from "../src/server/documents"
import { importJob } from "../src/server/import-job"
import { importProposalSchema } from "../src/server/import-proposal"
import { saveImportedOrder } from "../src/server/import-save"
import { saveLocationMapping } from "../src/server/inventory-location-settings"
import { acceptSupplierInvitation } from "../src/server/invitations"
import { amazonJob } from "../src/server/job-handlers"
import {
  approveInvoice,
  submitPacking,
  correctShipment,
  createOrder,
  submitOrder,
  newShipment,
  savePacking,
  checkPacking,
  closeOrder,
  receiveShipment
} from "../src/server/orders"
import { lineDefaultsFor, saveProductDefaults } from "../src/server/product-defaults"
import { runNextJob } from "../src/server/queue"
import { readSalesDemand } from "../src/server/sales"
import { listSalesOrders, requestSalesSync, storedDemand, syncChunks } from "../src/server/sales-orders"
import { hash } from "../src/server/security"
import { recordStockDays, stockoutDays } from "../src/server/stock-days"
import { saveSupplierLeadTimes } from "../src/server/suppliers"
import { orderWorkflow } from "../src/server/workflow"
import { applyMigrations } from "./migrations"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const buyerId = randomUUID(),
  supplierId = randomUUID(),
  otherId = randomUUID(),
  supplierLinkId = randomUUID(),
  orderId = randomUUID(),
  itemId = randomUUID()
const orderData = orderInputSchema.parse({
  supplierId: supplierLinkId,
  reference: "PO-TEST",
  destination: "awd_us",
  currency: "USD",
  dueDate: "2026-10-20",
  items: [
    {
      id: itemId,
      variantId: "gid://shopify/ProductVariant/1",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      name: "Foil body cord",
      variant: "Two-pack",
      buyerSku: "foil-2",
      supplierSku: "B-2",
      asin: "B000000001",
      fnsku: "X000000001",
      pieces: 160,
      piecesPerSet: 2,
      unitPrice: 210
    }
  ]
})
function actor(kind: "buyer" | "supplier", id: string): Session {
  return {
    user: { id: `user-${id}`, email: "tester@example.com", emailVerified: true },
    org: { id, kind, name: "Test org", workosId: null, createdAt: new Date() },
    role: "owner",
    workspaces: []
  }
}
const buyer = actor("buyer", buyerId),
  supplier = actor("supplier", supplierId)
beforeAll(async () => {
  context.current = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  vi.resetAllMocks()
  context.actor = buyer
  provider.amazonFor.mockResolvedValue(provider.api)
  await pg.exec("TRUNCATE organizations, jobs CASCADE")
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Buyer", kind: "buyer" },
    { id: supplierId, name: "Supplier", kind: "supplier" },
    { id: otherId, name: "Unrelated", kind: "buyer" }
  ])
  await database.insert(tables.suppliers).values({
    id: supplierLinkId,
    buyerOrgId: buyerId,
    supplierOrgId: supplierId,
    name: "Supplier",
    email: "supplier@example.com"
  })
  await database.insert(tables.orders).values({
    id: orderId,
    buyerOrgId: buyerId,
    supplierId: supplierLinkId,
    shopifyDomain: "test.myshopify.com",
    amazonSellerId: "A123456789",
    status: "submitted",
    data: orderData
  })
  await database
    .insert(tables.orderRevisions)
    .values({ orderId, revision: 1, data: orderData, actor: buyer.user.id, reason: "Created" })
})
async function preparation(pieces = 160) {
  const id = randomUUID(),
    invoiceId = randomUUID()
  await database.insert(tables.shipments).values({ id, orderId, orderRevision: 1, snapshot: orderData })
  await database.insert(tables.documents).values({
    id: invoiceId,
    orderId,
    shipmentId: id,
    kind: "invoice",
    objectKey: `test/${invoiceId}`,
    name: "Invoice.pdf",
    bytes: 10,
    orderRevision: 1,
    shipmentRevision: 1,
    uploadedBy: supplier.user.id
  })
  const packing = packingSchema.parse({
    invoiceDocumentId: invoiceId,
    readyDate: "2026-10-15",
    origin: {
      name: "Supplier",
      addressLine1: "Road 1",
      city: "Shenzhen",
      stateOrRegion: "Guangdong",
      postalCode: "518000",
      countryCode: "CN",
      phoneNumber: "+86123456789",
      email: "supplier@example.com"
    },
    cartons: [{ cartonId: "A6", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces }] }]
  })
  return { id, packing }
}
async function reviewedImport() {
  const id = randomUUID()
  const proposal = importProposalSchema.parse({
    reference: "PO36",
    currency: "USD",
    documentTotal: "665.60",
    warnings: [],
    adjustments: [{ description: "Packing", amount: "12.80", sourcePage: 1 }],
    items: [
      {
        description: "Foil cord",
        sourceSku: "supplier-1",
        sourcePage: 1,
        sourceQuantity: 160,
        sourceUnit: "pieces",
        sourceUnitPrice: "4.08",
        sourceLineTotal: "652.80",
        selectedVariantId: orderData.items[0]!.variantId,
        candidateVariantIds: [],
        pieces: 160,
        piecesPerSet: 2,
        pricePerPiece: "4.08",
        reason: "Matched SKU",
        warnings: []
      }
    ]
  })
  await database.insert(tables.poImports).values({
    id,
    orgId: buyerId,
    createdBy: buyer.user.id,
    objectKey: `imports/${id}`,
    filename: "invoice.pdf",
    shopifyDomain: "test.myshopify.com",
    amazonSellerId: "A123456789",
    status: "review",
    proposal
  })
  provider.connection.mockImplementation(async (_orgId: string, kind: string) => ({
    externalId: kind === "shopify" ? "test.myshopify.com" : "A123456789"
  }))
  provider.shopifyFor.mockResolvedValue({
    variants: async () => [
      {
        id: orderData.items[0]!.variantId,
        sku: "foil-2",
        title: "Two-pack",
        product: { title: "Verified foil cord" },
        inventoryItem: { id: orderData.items[0]!.inventoryItemId },
        supplierSku: { value: "B-2" },
        asin: { value: "B000000001" },
        // A two-pack is a Shopify bundle of two cords.
        requiresComponents: true,
        productVariantComponents: {
          nodes: [
            {
              quantity: 2,
              productVariant: { id: "gid://shopify/ProductVariant/99", sku: "foil", supplierSku: { value: "B-2" } }
            }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ]
  })
  provider.api.listings.mockResolvedValue(new Map([["foil-2", { asin: "B000000001", fnsku: "X000000001" }]]))
  return {
    id,
    proposal,
    input: {
      revision: 1,
      reviewed: true,
      supplierId: supplierLinkId,
      destination: "awd_us",
      reference: "PO36",
      dueDate: "2026-10-20"
    }
  }
}
async function orderConnections() {
  await database.insert(tables.connections).values([
    { orgId: buyerId, provider: "shopify", externalId: "test.myshopify.com", encryptedToken: "test-only" },
    { orgId: buyerId, provider: "amazon", externalId: "A123456789", encryptedToken: "test-only" }
  ])
}
describe("supplier catalog snapshots", () => {
  beforeEach(orderConnections)
  it("uses only the selected supplier catalog and snapshots the quote without replacing the buyer price", async () => {
    await reviewedImport()
    const [product] = await database
      .insert(tables.supplierProducts)
      .values({
        supplierOrgId: supplierId,
        supplierSku: "B-2",
        title: "Foil body cord",
        currency: "USD",
        priceMinor: 420,
        priceBasis: "sellable_pack",
        piecesPerSellablePack: 2,
        sellablePacksPerCase: 80,
        notes: "Verify current quote"
      })
      .returning()
    await database.insert(tables.supplierProducts).values({
      supplierOrgId: otherId,
      supplierSku: "B-2",
      title: "Wrong supplier",
      currency: "USD",
      priceMinor: 999,
      priceBasis: "piece",
      piecesPerSellablePack: 1
    })
    const saved = await createOrder(buyer, orderData)
    const [record] = await database.select().from(tables.orders).where(eq(tables.orders.id, saved.id))
    expect(record?.data.items[0]).toMatchObject({
      supplierCatalogStatus: "matched",
      unitPrice: 210,
      supplierSku: "",
      components: [
        {
          buyerSku: "foil",
          supplierSku: "B-2",
          quantity: 2,
          supplierCatalog: {
            productId: product!.id,
            revision: 1,
            priceMinor: 420,
            priceBasis: "sellable_pack",
            piecesPerSellablePack: 2,
            sellablePacksPerCase: 80,
            notes: "Verify current quote"
          }
        }
      ]
    })
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
  })
})
describe("reviewed import save", () => {
  beforeEach(orderConnections)
  it.each(["missing", "other_workspace", "pickup"] as const)(
    "rejects a %s forwarder without saving a draft",
    async (scenario) => {
      const imported = await reviewedImport()
      const forwarderId = randomUUID()
      if (scenario !== "missing") {
        const { packing } = await preparation()
        await database.insert(tables.contacts).values({
          id: forwarderId,
          orgId: scenario === "other_workspace" ? otherId : buyerId,
          kind: scenario === "pickup" ? "pickup" : "forwarder",
          name: "Contact",
          address: packing.origin
        })
      }
      await expect(
        saveImportedOrder(buyer, imported.id, { ...imported.input, destination: "forwarder", forwarderId })
      ).rejects.toThrow("freight forwarder in this workspace")
      expect(await database.select().from(tables.orders)).toHaveLength(1)
      expect((await database.select().from(tables.poImports))[0]).toMatchObject({ status: "review", orderId: null })
      expect(await database.select().from(tables.jobs)).toHaveLength(0)
    }
  )
  it("saves an owned forwarder as a draft without email or shipment jobs", async () => {
    const imported = await reviewedImport()
    const { packing } = await preparation()
    const [contact] = await database
      .insert(tables.contacts)
      .values({
        orgId: buyerId,
        kind: "forwarder",
        name: "Forwarder",
        address: packing.origin
      })
      .returning()
    const saved = await saveImportedOrder(buyer, imported.id, {
      ...imported.input,
      destination: "forwarder",
      forwarderId: contact!.id
    })
    const [order] = await database.select().from(tables.orders).where(eq(tables.orders.id, saved.id))
    expect(order).toMatchObject({ status: "draft", data: { destination: "forwarder", forwarderId: contact!.id } })
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
      error: "at most two decimal places",
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
describe("Postgres workflow and authorization", () => {
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
    new Request("http://localhost/api/inventory/refresh", { method: "POST", body: JSON.stringify({ source: "awd" }) })

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
        body: JSON.stringify({ source: "fba", marketplaceId: "ATVPDKIKX0DER" })
      })
    )
  const readFba = () =>
    readInventory(new Request("http://localhost/api/inventory?source=fba&marketplaceId=ATVPDKIKX0DER"))
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
    context.actor = actor("buyer", otherId)
    expect((await (await readFba()).json()).rows).toEqual([])
    expect((await refreshFba()).status).toBe(409)
    context.actor = supplier
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
            new Request("http://localhost/api/inventory/refresh", { method: "POST", body: JSON.stringify(body) })
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
    context.actor = actor("buyer", otherId)
    expect((await (await readLocations()).json()).locations).toEqual([])
    expect((await patch(body)).status).toBe(409)
    context.actor = supplier
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
      "not present"
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

  it("keeps delivery and forwarder addresses for buyers and pickup addresses for suppliers", async () => {
    const { packing } = await preparation()
    const save = (kind: string) =>
      action(
        new Request("http://localhost:3000/api/action", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ action: "contact.create", data: { name: kind, kind, address: packing.origin } })
        })
      )
    expect((await save("delivery")).status).toBe(200)
    expect((await save("forwarder")).status).toBe(200)
    expect(await (await save("pickup")).json()).toMatchObject({
      error: expect.stringContaining("suppliers' workspaces")
    })
    context.actor = supplier
    expect((await save("pickup")).status).toBe(200)
    expect(await (await save("delivery")).json()).toMatchObject({
      error: expect.stringContaining("pickup addresses only")
    })
    const saved = await database.select({ kind: tables.contacts.kind }).from(tables.contacts)
    expect(saved.map((contact) => contact.kind).toSorted()).toEqual(["delivery", "forwarder", "pickup"])
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
      expectedRevision: 0
    }
    expect(await saveProductDefaults(buyer, input)).toEqual({
      description: "Cotton, size label inside",
      prepCategory: "TAPING",
      casePacks: [{ name: "Standard case", units: 24, lengthCm: 40, widthCm: 30, heightCm: 20, weightKg: null }],
      minimumOrder: 48,
      revision: 1
    })
    await expect(saveProductDefaults(buyer, input)).rejects.toThrow("Someone else changed")
    expect(await saveProductDefaults(buyer, { ...input, prepCategory: null, expectedRevision: 1 })).toMatchObject({
      prepCategory: null,
      revision: 2
    })
    await expect(saveProductDefaults(buyer, { ...input, productId: "gid://shopify/Product/99" })).rejects.toThrow(
      "isn't in your synced"
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
    ).toEqual({ piecesPerSet: 1, description: "Cotton, size label inside", prepCategory: null })
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
    context.actor = actor("buyer", otherId)
    expect((await (await readShopify()).json()).snapshotId).toBeNull()
    expect((await refreshShopify()).status).toBe(409)
    context.actor = supplier
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
    context.actor = supplier
    expect((await refreshInventory(refreshRequest())).status).toBe(403)
    expect((await readInventory(new Request("http://localhost/api/inventory?source=awd"))).status).toBe(403)
    context.actor = buyer
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
    context.actor = actor("buyer", otherId)
    const unrelated = await (await readInventory(new Request("http://localhost/api/inventory?source=awd"))).json()
    expect(unrelated.rows).toEqual([])
    expect(
      (await readInventory(new Request(`http://localhost/api/inventory?source=awd&cursor=${response.nextCursor}`)))
        .status
    ).toBe(409)
  })

  it("reports only the buyer's submitted POs with canonical identities and assigned pieces", async () => {
    const { id, packing } = await preparation(40)
    await database
      .update(tables.shipments)
      .set({ status: "needs_attention", packing })
      .where(eq(tables.shipments.id, id))
    await database.insert(tables.orders).values([
      {
        buyerOrgId: buyerId,
        supplierId: supplierLinkId,
        shopifyDomain: "test.myshopify.com",
        amazonSellerId: "A123456789",
        status: "draft",
        data: orderData
      },
      {
        buyerOrgId: buyerId,
        supplierId: supplierLinkId,
        shopifyDomain: "test.myshopify.com",
        amazonSellerId: "A123456789",
        status: "closed",
        data: orderData
      },
      {
        buyerOrgId: otherId,
        supplierId: supplierLinkId,
        shopifyDomain: "other.myshopify.com",
        amazonSellerId: "OTHER",
        status: "submitted",
        data: orderData
      }
    ])
    const response = await getCoverage(new Request("http://localhost/api/orders/summary"))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    const result = await response.json()
    expect(result.orders).toHaveLength(1)
    expect(result.nextCursor).toBeNull()
    expect(result.orders[0]).toMatchObject({
      id: orderId,
      shopifyDomain: "test.myshopify.com",
      amazonSellerId: "A123456789",
      supplier: { id: supplierLinkId },
      items: [
        {
          itemId,
          variantId: "gid://shopify/ProductVariant/1",
          piecesPerSet: 2,
          assignedPieces: 40,
          remainingPieces: 120,
          assignedByStatus: { needs_attention: 40 }
        }
      ]
    })
    expect(provider.shopifyFor).not.toHaveBeenCalled()
    expect(provider.amazonFor).not.toHaveBeenCalled()
  })

  it("filters coverage by supplier and destination without exposing unrelated suppliers", async () => {
    const otherSupplier = randomUUID()
    await database
      .insert(tables.suppliers)
      .values({ id: otherSupplier, buyerOrgId: buyerId, name: "Second supplier", email: "second@example.com" })
    await database.insert(tables.orders).values({
      buyerOrgId: buyerId,
      supplierId: otherSupplier,
      shopifyDomain: "test.myshopify.com",
      amazonSellerId: "A123456789",
      status: "submitted",
      data: { ...orderData, supplierId: otherSupplier, destination: "fba" }
    })
    const matching = await getCoverage(
      new Request(`http://localhost/api/orders/summary?supplierId=${supplierLinkId}&destination=awd_us`)
    )
    expect((await matching.json()).orders.map((order: { id: string }) => order.id)).toEqual([orderId])
    for (const filter of [`supplierId=${supplierLinkId}&destination=fba`, `supplierId=${randomUUID()}`]) {
      const response = await getCoverage(new Request(`http://localhost/api/orders/summary?${filter}`))
      expect(await response.json()).toEqual({ orders: [], nextCursor: null })
    }
    context.actor = actor("buyer", otherId)
    const unrelated = await getCoverage(new Request(`http://localhost/api/orders/summary?supplierId=${supplierLinkId}`))
    expect(await unrelated.json()).toEqual({ orders: [], nextCursor: null })
  })

  it("paginates coverage by immutable order ID even if the cursor order is closed", async () => {
    const ids = [orderId, randomUUID(), randomUUID()].sort()
    await database.insert(tables.orders).values(
      ids
        .filter((id) => id !== orderId)
        .map((id) => ({
          id,
          buyerOrgId: buyerId,
          supplierId: supplierLinkId,
          shopifyDomain: "test.myshopify.com",
          amazonSellerId: "A123456789",
          status: "submitted" as const,
          data: orderData
        }))
    )
    const first = await (await getCoverage(new Request("http://localhost/api/orders/summary?limit=1"))).json()
    expect(first.orders.map((order: { id: string }) => order.id)).toEqual([ids[0]])
    expect(first.nextCursor).toBe(ids[0])
    await database.update(tables.orders).set({ status: "closed" }).where(eq(tables.orders.id, ids[0]!))
    const rest = await (
      await getCoverage(new Request(`http://localhost/api/orders/summary?limit=2&cursor=${first.nextCursor}`))
    ).json()
    expect(rest.orders.map((order: { id: string }) => order.id)).toEqual(ids.slice(1))
    expect(rest.nextCursor).toBeNull()
  })

  it("rejects supplier access to buyer coverage", async () => {
    context.actor = supplier
    const response = await getCoverage(new Request("http://localhost/api/orders/summary"))
    expect(response.status).toBe(403)
    expect(await response.json()).not.toHaveProperty("orders")
  })

  it.each([
    "limit=0",
    "limit=51",
    "limit=1.5",
    "cursor=invalid",
    "destination=unknown",
    "supplierId=invalid",
    "limit=1&limit=2",
    "orgId=override"
  ])("rejects invalid coverage query %s", async (query) => {
    expect((await getCoverage(new Request(`http://localhost/api/orders/summary?${query}`))).status).toBe(400)
  })

  it.each([
    { status: "packing", assigned: 0 },
    { status: "cancelled", assigned: 0 },
    { status: "approval", assigned: 40 },
    { status: "queued", assigned: 40 },
    { status: "creating", assigned: 40 },
    { status: "waiting_labels", assigned: 40 },
    { status: "ready", assigned: 40 },
    { status: "collected", assigned: 40 },
    { status: "correction", assigned: 40 },
    { status: "needs_attention", assigned: 40 }
  ] satisfies { status: tables.ShipmentState; assigned: number }[])(
    "reports $status quantities as assignments, not receipts",
    async ({ status, assigned }) => {
      const { id, packing } = await preparation(40)
      await database
        .update(tables.shipments)
        .set({ status, packing, operation: "sending" })
        .where(eq(tables.shipments.id, id))
      const workflow = await orderWorkflow(buyer, orderId)
      expect(workflow.items[0]).toMatchObject({
        orderedPieces: 160,
        assignedPieces: assigned,
        remainingPieces: 160 - assigned,
        overAssignedPieces: 0,
        assignedByStatus: assigned ? { [status]: assigned } : {}
      })
      expect(workflow.items[0]).not.toHaveProperty("receivedPieces")
    }
  )

  it("partitions partial shipment assignments and ignores saved packing drafts", async () => {
    const first = await preparation(40)
    const second = await preparation(60)
    const draft = await preparation(100)
    await database
      .update(tables.shipments)
      .set({ status: "collected", packing: first.packing })
      .where(eq(tables.shipments.id, first.id))
    await database
      .update(tables.shipments)
      .set({ status: "needs_attention", packing: second.packing })
      .where(eq(tables.shipments.id, second.id))
    await database
      .update(tables.shipments)
      .set({ packingDraft: draft.packing })
      .where(eq(tables.shipments.id, draft.id))
    const workflow = await orderWorkflow(buyer, orderId)
    expect(workflow.items[0]).toMatchObject({
      orderedPieces: 160,
      assignedPieces: 100,
      assignedByStatus: { collected: 40, needs_attention: 60 },
      remainingPieces: 60,
      overAssignedPieces: 0
    })
  })

  it("exposes over-assignment rather than concealing a quantity discrepancy", async () => {
    const first = await preparation(100)
    const second = await preparation(80)
    for (const shipment of [first, second]) {
      await database
        .update(tables.shipments)
        .set({ status: "correction", packing: shipment.packing })
        .where(eq(tables.shipments.id, shipment.id))
    }
    const workflow = await orderWorkflow(buyer, orderId)
    expect(workflow.items[0]).toMatchObject({
      assignedPieces: 180,
      assignedByStatus: { correction: 180 },
      remainingPieces: 0,
      overAssignedPieces: 20
    })
  })

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
    const params = { params: Promise.resolve({ id: imported.id }) }
    const request = new Request(`http://localhost/api/imports/${imported.id}/catalog?q=supplier-1`)
    const response = await searchImportCatalog(request, params)
    expect(await response.json()).toEqual({ results: [variant], nextCursor: "next", complete: false })
    expect(provider.shopifyFor).toHaveBeenCalledWith(buyerId, "test.myshopify.com")
    provider.shopifyFor.mockClear()
    context.actor = actor("buyer", otherId)
    expect((await searchImportCatalog(request, params)).status).toBe(404)
    expect(provider.shopifyFor).not.toHaveBeenCalled()
  })
  it("rejects stale review edits before catalog access and handles invalid JSON", async () => {
    const imported = await reviewedImport()
    const origin = process.env.APP_URL ?? "http://localhost:3000"
    const params = { params: Promise.resolve({ id: imported.id }) }
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
      { params: Promise.resolve({ id: imported.id }) }
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
    const params = { params: Promise.resolve({ id }) }
    const own = await getImport(new Request(`http://localhost/api/imports/${id}`), params)
    expect(own.status).toBe(200)
    expect(await own.json()).not.toHaveProperty("objectKey")
    context.actor = actor("buyer", otherId)
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
      status: "failed"
    })
    const params = { params: Promise.resolve({ id }) }
    const origin = process.env.APP_URL ?? "http://localhost:3000"
    const request = () => new Request(`${origin}/api/imports/${id}`, { method: "POST", headers: { origin } })
    expect((await retryImport(request(), params)).status).toBe(202)
    expect((await retryImport(request(), params)).status).toBe(409)
    expect(await database.select().from(tables.jobs)).toHaveLength(1)
    expect((await cancelImport(request(), params)).status).toBe(200)
    const [record] = await database.select().from(tables.poImports)
    expect(record?.status).toBe("cancelled")
    expect(record?.revision).toBe(3)
    expect((await retryImport(request(), params)).status).toBe(409)
  })
  it("accepts into the selected owned supplier workspace and consumes the invitation once", async () => {
    const invitation = "supplier-invitation-test-token"
    await database
      .insert(tables.memberships)
      .values({ orgId: supplierId, userId: buyer.user.id, email: buyer.user.email, role: "owner" })
    await database
      .update(tables.suppliers)
      .set({
        supplierOrgId: null,
        email: buyer.user.email,
        invitationHash: hash(invitation),
        expiresAt: new Date(Date.now() + 60000)
      })
      .where(eq(tables.suppliers.id, supplierLinkId))
    await acceptSupplierInvitation(buyer.user, supplierId, invitation)
    const [saved] = await database.select().from(tables.suppliers)
    expect(saved?.supplierOrgId).toBe(supplierId)
    expect(saved?.invitationHash).toBeNull()
    await expect(acceptSupplierInvitation(buyer.user, supplierId, invitation)).rejects.toThrow("Invitation expired")
  })

  it("rejects invitation acceptance into a buyer workspace, unowned supplier workspace or different email", async () => {
    const invitation = "supplier-invitation-test-token"
    await database
      .update(tables.suppliers)
      .set({ supplierOrgId: null, invitationHash: hash(invitation), expiresAt: new Date(Date.now() + 60000) })
      .where(eq(tables.suppliers.id, supplierLinkId))
    await database
      .insert(tables.memberships)
      .values({ orgId: buyerId, userId: buyer.user.id, email: buyer.user.email, role: "owner" })
    await expect(acceptSupplierInvitation(buyer.user, buyerId, invitation)).rejects.toThrow("supplier workspace")
    await expect(acceptSupplierInvitation(buyer.user, supplierId, invitation)).rejects.toThrow("supplier workspace")
    await database
      .insert(tables.memberships)
      .values({ orgId: supplierId, userId: buyer.user.id, email: buyer.user.email, role: "member" })
    await expect(acceptSupplierInvitation(buyer.user, supplierId, invitation)).rejects.toThrow("supplier workspace")
    await database.update(tables.memberships).set({ role: "owner" }).where(eq(tables.memberships.orgId, supplierId))
    await expect(acceptSupplierInvitation(buyer.user, supplierId, invitation)).rejects.toThrow("different email")
    await expect(
      acceptSupplierInvitation({ ...buyer.user, emailVerified: false }, supplierId, invitation)
    ).rejects.toThrow("Verify your email")
    const [saved] = await database.select().from(tables.suppliers)
    expect(saved?.supplierOrgId).toBeNull()
    expect(saved?.invitationHash).toBe(hash(invitation))
  })

  it("isolates buyers and suppliers by explicit shared order", async () => {
    expect((await accessibleOrder(buyer, orderId)).order.id).toBe(orderId)
    expect((await accessibleOrder(supplier, orderId)).order.id).toBe(orderId)
    await expect(accessibleOrder(actor("buyer", otherId), orderId)).rejects.toThrow("not found")
    await expect(accessibleOrder(actor("supplier", otherId), orderId)).rejects.toThrow("not found")
    await database.update(tables.orders).set({ status: "draft" }).where(eq(tables.orders.id, orderId))
    await expect(accessibleOrder(supplier, orderId)).rejects.toThrow("not found")
  })
  it("reserves pieces and prevents over-allocation to a second partial shipment", async () => {
    const first = await preparation(),
      second = await preparation()
    await submitPacking(supplier, first.id, first.packing, 1)
    await expect(submitPacking(supplier, second.id, second.packing, 1)).rejects.toThrow("remaining")
    expect(await database.select().from(tables.jobs)).toHaveLength(1)
  })
  it("ships POs to the buyer's own location without Amazon", async () => {
    const deliveryId = randomUUID()
    const { packing } = await preparation()
    await database.insert(tables.contacts).values({
      id: deliveryId,
      orgId: buyerId,
      name: "Warehouse",
      kind: "delivery",
      address: packing.origin
    })
    // Two SKUs in one oversized carton and no FNSKU: fine for the buyer's own location, not for AWD.
    const toWarehouse = {
      ...orderData,
      destination: "warehouse" as const,
      deliveryId,
      items: orderData.items.map((item) => ({ ...item, fnsku: "", asin: "" }))
    }
    await database.update(tables.orders).set({ data: toWarehouse }).where(eq(tables.orders.id, orderId))
    await database.update(tables.shipments).set({ snapshot: toWarehouse }).where(eq(tables.shipments.orderId, orderId))
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.orderId, orderId))
    const oversized = { ...packing, cartons: [{ ...packing.cartons[0]!, length: 90, weight: 30 }] }
    await submitPacking(supplier, shipment!.id, oversized, 1)
    const [ready] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipment!.id))
    expect(ready?.status).toBe("ready")
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
  })
  it("does not enqueue duplicate Amazon creation after repeat submit", async () => {
    const shipment = await preparation()
    await submitPacking(supplier, shipment.id, shipment.packing, 1)
    await expect(submitPacking(supplier, shipment.id, shipment.packing, 1)).rejects.toThrow("changed")
    expect(await database.select().from(tables.jobs)).toHaveLength(1)
  })
  it("requires invoice changes to be buyer-approved and preserves PO revisions", async () => {
    const shipment = await preparation()
    shipment.packing.changes = [{ itemId, supplierSku: "B02", unitPrice: 230 }]
    expect(await submitPacking(supplier, shipment.id, shipment.packing, 1)).toEqual({ approval: true })
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    await expect(approveInvoice(supplier, shipment.id, 1, false)).rejects.toThrow("buyer workspace")
    await approveInvoice(buyer, shipment.id, 1, false)
    const revisions = await database.select().from(tables.orderRevisions).orderBy(tables.orderRevisions.revision)
    expect(revisions.map((r) => r.data.items[0]?.unitPrice)).toEqual([210, 230])
    expect((await database.select().from(tables.jobs)).map((j) => j.kind).sort()).toEqual([
      "amazon",
      "email",
      "shopify"
    ])
  })
  it("rejects foreign invoices and stale shipment revisions", async () => {
    const shipment = await preparation(),
      other = await preparation()
    await expect(
      submitPacking(
        supplier,
        shipment.id,
        { ...shipment.packing, invoiceDocumentId: other.packing.invoiceDocumentId },
        1
      )
    ).rejects.toThrow("official commercial invoice")
    await expect(submitPacking(supplier, shipment.id, shipment.packing, 2)).rejects.toThrow("changed")
  })
  it("invalidates documents and cancels pending work when correcting", async () => {
    const shipment = await preparation()
    await submitPacking(supplier, shipment.id, shipment.packing, 1)
    await correctShipment(supplier, shipment.id, "Incorrect weight")
    const [row] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipment.id))
    expect(row?.status).toBe("correction")
    expect(row?.revision).toBe(2)
    expect((await database.select().from(tables.documents))[0]?.outdated).toBe(1)
    expect((await database.select().from(tables.jobs))[0]?.status).toBe("cancelled")
  })
})

async function queuedShipment() {
  const prepared = await preparation()
  await submitPacking(supplier, prepared.id, prepared.packing, 1)
  const remote = {
    ...buildAwdRequest(orderData, prepared.packing, `copacker-${prepared.id}-1`),
    orderId: "STAR-EXAMPLE",
    orderStatus: "DRAFT"
  }
  provider.api.create.mockResolvedValue({ orderId: remote.orderId })
  provider.api.order.mockResolvedValue(remote)
  return { ...prepared, remote }
}
async function retryDue() {
  await database.update(tables.jobs).set({ runAt: new Date(0) })
}

describe("durable shipment worker recovery", () => {
  it("resumes confirmation polling without creating a second Amazon order", async () => {
    const shipment = await queuedShipment()
    expect(await runNextJob()).toBe(true)
    expect(provider.amazonFor).toHaveBeenCalledWith(buyerId, "A123456789")
    expect(provider.api.create).toHaveBeenCalledOnce()
    expect(provider.api.confirm).toHaveBeenCalledOnce()
    provider.api.order.mockResolvedValue({ ...shipment.remote, orderStatus: "VALIDATING" })
    await retryDue()
    await runNextJob()
    expect(provider.api.create).toHaveBeenCalledOnce()
    expect(provider.api.confirm).toHaveBeenCalledOnce()
    const [job] = await database.select().from(tables.jobs)
    expect(job).toMatchObject({ status: "pending", attempts: 2 })
  })
  it("preserves an uncertain create checkpoint and refuses repeat create or correction", async () => {
    const shipment = await queuedShipment()
    provider.api.create.mockRejectedValue(new Error("Connection lost after request sent"))
    await runNextJob()
    const [row] = await database.select().from(tables.shipments)
    expect(row).toMatchObject({ status: "needs_attention", operation: "sending", amazonOrderId: null, revision: 1 })
    await expect(correctShipment(buyer, shipment.id, "Change cartons")).rejects.toThrow("Reconcile")
    await database.update(tables.shipments).set({ status: "queued" })
    await database.update(tables.jobs).set({ status: "pending", runAt: new Date(0) })
    await runNextJob()
    expect(provider.api.create).toHaveBeenCalledOnce()
    expect((await database.select().from(tables.jobs))[0]?.error).toContain("outcome is unknown")
  })
  it("dispatches creation only once when overlapping workers reach the checkpoint", async () => {
    const shipment = await queuedShipment()
    let arrived = 0
    let unblock: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      unblock = resolve
    })
    provider.api.eligibility.mockImplementation(async () => {
      if (++arrived === 2) {
        unblock()
      }
      await gate
    })
    await Promise.allSettled([
      amazonJob({ shipmentId: shipment.id, revision: 1 }, async () => undefined),
      amazonJob({ shipmentId: shipment.id, revision: 1 }, async () => undefined)
    ])
    expect(provider.api.create).toHaveBeenCalledOnce()
  })
  it("rejects a reconciled order with different cartons before confirmation", async () => {
    const shipment = await queuedShipment()
    await database.update(tables.shipments).set({ amazonOrderId: shipment.remote.orderId, operation: "created" })
    provider.api.order.mockResolvedValue({ ...shipment.remote, packagesToInbound: [] })
    await runNextJob()
    expect(provider.api.create).not.toHaveBeenCalled()
    expect(provider.api.confirm).not.toHaveBeenCalled()
    expect((await database.select().from(tables.jobs))[0]?.error).toContain("carton contents")
  })
  it("rejects a reconciled order with another shipment reference", async () => {
    const shipment = await queuedShipment()
    await database.update(tables.shipments).set({ amazonOrderId: shipment.remote.orderId, operation: "created" })
    provider.api.order.mockResolvedValue({ ...shipment.remote, externalReferenceId: "some-other-order" })
    await runNextJob()
    expect(provider.api.confirm).not.toHaveBeenCalled()
    expect((await database.select().from(tables.jobs))[0]?.error).toContain("reference")
  })
  it("reclaims a stale lease and reads back the existing order", async () => {
    const shipment = await queuedShipment()
    await database
      .update(tables.shipments)
      .set({ status: "creating", amazonOrderId: shipment.remote.orderId, operation: "created" })
    await database.update(tables.jobs).set({ status: "running", leaseAt: new Date(0), attempts: 1 })
    await runNextJob()
    expect(provider.api.create).not.toHaveBeenCalled()
    expect(provider.api.confirm).toHaveBeenCalledOnce()
    expect((await database.select().from(tables.jobs))[0]?.attempts).toBe(2)
  })
  it("does not claim a worker with an unexpired lease", async () => {
    await queuedShipment()
    await database.update(tables.jobs).set({ status: "running", leaseAt: new Date() })
    expect(await runNextJob()).toBe(false)
    expect(provider.api.create).not.toHaveBeenCalled()
  })
  it("prevents an old worker from confirming or overwriting a newer attempt", async () => {
    const shipment = await queuedShipment()
    await database.update(tables.shipments).set({ amazonOrderId: shipment.remote.orderId, operation: "created" })
    provider.api.order.mockImplementation(async () => {
      await database.update(tables.jobs).set({ status: "running", attempts: 2, error: "new worker" })
      return shipment.remote
    })
    await runNextJob()
    expect(provider.api.confirm).not.toHaveBeenCalled()
    expect((await database.select().from(tables.jobs))[0]).toMatchObject({
      status: "running",
      attempts: 2,
      error: "new worker"
    })
    expect((await database.select().from(tables.shipments))[0]?.status).toBe("creating")
  })
  it("cannot resume ownership when a manual retry starts a fresh job with the same attempt count", async () => {
    const shipment = await queuedShipment()
    await database.update(tables.shipments).set({ amazonOrderId: shipment.remote.orderId, operation: "created" })
    const replacementId = randomUUID()
    provider.api.order.mockImplementation(async () => {
      await database.update(tables.jobs).set({ id: replacementId, status: "running", attempts: 1 })
      return shipment.remote
    })
    await runNextJob()
    expect(provider.api.confirm).not.toHaveBeenCalled()
    expect((await database.select().from(tables.jobs))[0]).toMatchObject({
      id: replacementId,
      status: "running",
      attempts: 1
    })
  })
  it("ignores work queued for an outdated shipment revision", async () => {
    await queuedShipment()
    await database.update(tables.shipments).set({ revision: 2, status: "correction" })
    await runNextJob()
    expect(provider.api.create).not.toHaveBeenCalled()
    expect((await database.select().from(tables.jobs))[0]?.status).toBe("complete")
  })
  it("stops polling at the configured attempt limit", async () => {
    const shipment = await queuedShipment()
    provider.api.order.mockResolvedValue({ ...shipment.remote, orderStatus: "VALIDATING" })
    await database.update(tables.jobs).set({ attempts: 59 })
    await runNextJob()
    expect((await database.select().from(tables.jobs))[0]).toMatchObject({ status: "failed", attempts: 60 })
    expect((await database.select().from(tables.shipments))[0]?.status).toBe("needs_attention")
  })
})

describe("receiving and closing POs", () => {
  const shipment = async (status: string) => {
    const id = randomUUID()
    await database
      .insert(tables.shipments)
      .values({ id, orderId, orderRevision: 1, snapshot: orderData, status: status as "packing" })
    return id
  }

  it("keeps a PO open while a shipment is in progress and closes it once the goods arrive", async () => {
    const ready = await shipment("ready")
    const unpacked = await shipment("packing")
    await expect(closeOrder(buyer, orderId)).rejects.toThrow("still in progress")
    await expect(receiveShipment(supplier, ready)).rejects.toThrow("buyer workspace")
    await receiveShipment(buyer, ready)
    await expect(receiveShipment(buyer, ready)).rejects.toThrow("released or collected")
    await closeOrder(buyer, orderId)
    const rows = await database.select().from(tables.shipments).where(eq(tables.shipments.orderId, orderId))
    expect(Object.fromEntries(rows.map((row) => [row.id, row.status]))).toMatchObject({
      [ready]: "received",
      [unpacked]: "cancelled"
    })
    const [closed] = await database.select().from(tables.orders).where(eq(tables.orders.id, orderId))
    expect(closed?.status).toBe("closed")
    await expect(closeOrder(buyer, orderId)).rejects.toThrow("already closed")
    await expect(closeOrder(supplier, orderId)).rejects.toThrow("buyer workspace")
  })
})

describe("removing suppliers", () => {
  const supplierAction = (name: string, data: Record<string, unknown>) =>
    action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: name, data })
      })
    )

  it("keeps a supplier working on a sent PO, then removes it and revokes its access", async () => {
    expect(await (await supplierAction("supplier.remove", { id: supplierLinkId })).json()).toMatchObject({
      error: expect.stringContaining("Close it first")
    })
    await closeOrder(buyer, orderId)
    expect((await supplierAction("supplier.remove", { id: supplierLinkId })).status).toBe(200)
    const [removed] = await database.select().from(tables.suppliers).where(eq(tables.suppliers.id, supplierLinkId))
    expect(removed?.removedAt).toBeInstanceOf(Date)
    // The buyer still sees its PO; the removed supplier no longer does.
    expect((await accessibleOrder(buyer, orderId)).supplier.name).toBe("Supplier")
    await expect(accessibleOrder(supplier, orderId)).rejects.toThrow("not found")
    expect(await (await supplierAction("supplier.remove", { id: supplierLinkId })).json()).toMatchObject({
      error: expect.stringContaining("already removed")
    })
  })

  it("restores a removed supplier with a fresh invitation when it is added again", async () => {
    await closeOrder(buyer, orderId)
    await supplierAction("supplier.remove", { id: supplierLinkId })
    expect((await supplierAction("supplier.create", { name: "Supplier", email: "new@example.com" })).status).toBe(200)
    const rows = await database.select().from(tables.suppliers).where(eq(tables.suppliers.buyerOrgId, buyerId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: supplierLinkId,
      email: "new@example.com",
      removedAt: null,
      supplierOrgId: null
    })
    expect(rows[0]?.invitationHash).toBeTruthy()
    expect(
      await (await supplierAction("supplier.create", { name: "Supplier", email: "x@example.com" })).json()
    ).toMatchObject({
      error: expect.stringContaining("already one of your suppliers")
    })
  })
})

describe("PO product identity", () => {
  beforeEach(orderConnections)
  it("uses Shopify identity and server-fetched Amazon FNSKU instead of browser values", async () => {
    provider.connection.mockImplementation(async (_orgId: string, kind: string) => ({
      externalId: kind === "shopify" ? "test.myshopify.com" : "A123456789"
    }))
    provider.shopifyFor.mockResolvedValue({
      variants: async () => [
        {
          id: orderData.items[0]!.variantId,
          sku: "foil-2",
          title: "Two-pack",
          product: { title: "Real foil cord" },
          inventoryItem: { id: orderData.items[0]!.inventoryItemId },
          supplierSku: { value: "Actual supplier code" },
          asin: { value: "B000000001" }
        }
      ]
    })
    provider.api.listings.mockResolvedValue(new Map([["foil-2", { asin: "B000000001", fnsku: "X000000002" }]]))
    const created = await createOrder(buyer, {
      ...orderData,
      items: [{ ...orderData.items[0], buyerSku: "browser-sku", fnsku: "X999999999" }]
    })
    expect(created.data.items[0]).toMatchObject({
      buyerSku: "foil-2",
      name: "Real foil cord",
      supplierSku: "Actual supplier code",
      fnsku: "X000000002"
    })
    expect(provider.api.listings).toHaveBeenCalledWith("A123456789", ["foil-2"])
    provider.api.listings.mockResolvedValue(new Map([["foil-2", { asin: "B999999999", fnsku: "X000000002" }]]))
    await expect(createOrder(buyer, orderData)).rejects.toThrow("ASINs disagree")
  })

  it("takes pieces per unit from the Shopify bundle instead of the browser", async () => {
    provider.connection.mockImplementation(async (_orgId: string, kind: string) => ({
      externalId: kind === "shopify" ? "test.myshopify.com" : "A123456789"
    }))
    provider.shopifyFor.mockResolvedValue({
      variants: async () => [
        {
          id: orderData.items[0]!.variantId,
          sku: "foil-3pk",
          title: "Three-pack",
          product: { title: "Foil cord" },
          inventoryItem: { id: orderData.items[0]!.inventoryItemId },
          supplierSku: null,
          asin: null,
          requiresComponents: true,
          productVariantComponents: {
            nodes: [
              { quantity: 3, productVariant: { id: "gid://shopify/ProductVariant/77", sku: "foil", supplierSku: null } }
            ],
            pageInfo: { hasNextPage: false }
          }
        }
      ]
    })
    provider.api.listings.mockResolvedValue(new Map())
    const line = orderData.items[0]!
    await expect(
      createOrder(buyer, { ...orderData, items: [{ ...line, pieces: 10, piecesPerSet: 1 }] })
    ).rejects.toThrow("bundle of 3")
    const created = await createOrder(buyer, { ...orderData, items: [{ ...line, pieces: 12, piecesPerSet: 1 }] })
    expect(created.data.items[0]).toMatchObject({ pieces: 12, piecesPerSet: 3 })
  })

  it("creates a draft without Amazon and looks up identifiers when it is sent", async () => {
    await database
      .delete(tables.connections)
      .where(and(eq(tables.connections.orgId, buyerId), eq(tables.connections.provider, "amazon")))
    provider.connection.mockImplementation(async (_orgId: string, kind: string) => ({
      externalId: kind === "shopify" ? "test.myshopify.com" : "A123456789"
    }))
    provider.shopifyFor.mockResolvedValue({
      variants: async () => [
        {
          id: orderData.items[0]!.variantId,
          sku: "foil-2",
          title: "Two-pack",
          product: { title: "Real foil cord" },
          inventoryItem: { id: orderData.items[0]!.inventoryItemId },
          supplierSku: null,
          asin: { value: "B000000001" }
        }
      ]
    })
    provider.api.listings.mockClear()
    const created = await createOrder(buyer, orderData)
    expect(created).toMatchObject({ amazonSellerId: null })
    expect(created.data.items[0]).toMatchObject({ asin: "B000000001", fnsku: "" })
    expect(provider.api.listings).not.toHaveBeenCalled()
    await expect(submitOrder(buyer, created.id, 1)).rejects.toThrow("Connect Amazon in Settings")

    await orderConnectionsAmazonOnly()
    provider.api.listings.mockResolvedValue(new Map([["foil-2", { asin: "B000000009", fnsku: "X000000002" }]]))
    await expect(submitOrder(buyer, created.id, 1)).rejects.toThrow("no matching FBA listing for foil-2")
    provider.api.listings.mockResolvedValue(new Map([["foil-2", { asin: "B000000001", fnsku: "X000000002" }]]))
    await submitOrder(buyer, created.id, 1)
    const [sent] = await database.select().from(tables.orders).where(eq(tables.orders.id, created.id))
    expect(sent).toMatchObject({ status: "submitted", amazonSellerId: "A123456789" })
    expect(sent?.data.items[0]).toMatchObject({ asin: "B000000001", fnsku: "X000000002" })
    const [revision] = await database
      .select()
      .from(tables.orderRevisions)
      .where(eq(tables.orderRevisions.orderId, created.id))
    expect(revision?.data.items[0]?.fnsku).toBe("X000000002")
  })
})

async function orderConnectionsAmazonOnly() {
  await database
    .insert(tables.connections)
    .values({ orgId: buyerId, provider: "amazon", externalId: "A123456789", encryptedToken: "test-only" })
}

async function uploadPdf(kind: string, shipmentId?: string, pages = 1, assignments?: unknown) {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    pdf.addPage([288, 432])
  }
  const form = new FormData()
  form.set("orderId", orderId)
  form.set("kind", kind)
  form.set("file", new File([Buffer.from(await pdf.save())], "Labels.pdf", { type: "application/pdf" }))
  if (shipmentId) {
    form.set("shipmentId", shipmentId)
  }
  if (kind === "product_label") {
    form.set("itemId", itemId)
  }
  if (assignments) {
    form.set("assignments", JSON.stringify(assignments))
  }
  return upload(
    new Request("http://localhost:3000/api/documents", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: form
    })
  )
}
async function release(id: string, revision = 1) {
  return action(
    new Request("http://localhost:3000/api/action", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ action: "shipment.release", data: { id, revision, bookingReference: "BOOKING-1" } })
    })
  )
}
describe("document upload and packet release", () => {
  it("rejects stale generated shipment documents without invalidating the current replacement", async () => {
    const prepared = await preparation()
    await database
      .update(tables.shipments)
      .set({ status: "waiting_labels", packing: prepared.packing })
      .where(eq(tables.shipments.id, prepared.id))
    const input = {
      orderId,
      shipmentId: prepared.id,
      kind: "packing_list" as const,
      name: "Packing list.pdf",
      orderRevision: 1,
      shipmentRevision: 1,
      uploadedBy: "system"
    }
    const original = await storeDocument(input, new Uint8Array([1]))
    storage.putFile.mockImplementation(async () => {
      await database.update(tables.shipments).set({ revision: 2 }).where(eq(tables.shipments.id, prepared.id))
    })
    await expect(storeDocument(input, new Uint8Array([2]))).rejects.toThrow("Shipment changed")
    const docs = await database.select().from(tables.documents).where(eq(tables.documents.kind, "packing_list"))
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ id: original.id, outdated: 0 })
  })
  it("keeps the current packing document when regenerating its replacement fails", async () => {
    const prepared = await preparation()
    await database
      .update(tables.shipments)
      .set({ status: "waiting_labels", packing: prepared.packing })
      .where(eq(tables.shipments.id, prepared.id))
    const doc = await storeDocument(
      {
        orderId,
        shipmentId: prepared.id,
        kind: "packing_list",
        name: "Packing list.pdf",
        orderRevision: 1,
        shipmentRevision: 1,
        uploadedBy: "system"
      },
      new Uint8Array([1])
    )
    storage.putFile.mockRejectedValue(new Error("Storage unavailable"))
    await expect(generateShipmentDocuments(prepared.id)).rejects.toThrow("Storage unavailable")
    expect((await database.select().from(tables.documents).where(eq(tables.documents.id, doc.id)))[0]?.outdated).toBe(0)
  })
  it("marks generated POs historical when the PO revision changes during storage", async () => {
    storage.putFile.mockImplementation(async () => {
      await database.update(tables.orders).set({ revision: 2 }).where(eq(tables.orders.id, orderId))
    })
    const doc = await storeDocument(
      { orderId, kind: "purchase_order", name: "PO.pdf", orderRevision: 1, outdated: 0, uploadedBy: "system" },
      new Uint8Array([1])
    )
    expect(doc.outdated).toBe(1)
  })
  it("rejects an invoice upload if packing changes during storage, preserving the current invoice", async () => {
    const prepared = await preparation()
    context.actor = supplier
    storage.putFile.mockImplementation(async () => {
      await database.update(tables.shipments).set({ revision: 2 }).where(eq(tables.shipments.id, prepared.id))
    })
    const result = await uploadPdf("invoice", prepared.id)
    expect(result.status).toBe(400)
    expect(await result.json()).toMatchObject({ error: "Shipment changed during upload. Try again" })
    const docs = await database.select().from(tables.documents)
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ id: prepared.packing.invoiceDocumentId, outdated: 0 })
  })
  it("rejects carrier labels when the shipment is released during upload", async () => {
    const prepared = await preparation()
    await database
      .update(tables.shipments)
      .set({ status: "waiting_labels", packing: prepared.packing })
      .where(eq(tables.shipments.id, prepared.id))
    storage.putFile.mockImplementation(async () => {
      await database.update(tables.shipments).set({ status: "ready" }).where(eq(tables.shipments.id, prepared.id))
    })
    const result = await uploadPdf("shipping_label", prepared.id, 1, [{ cartonId: "A6", page: 1 }])
    expect(result.status).toBe(400)
    expect(await result.json()).toMatchObject({ error: "Shipment changed during upload. Try again" })
    expect((await database.select().from(tables.documents)).some((doc) => doc.kind === "shipping_label")).toBe(false)
  })
  it("rejects product labels when the PO changes during upload", async () => {
    storage.putFile.mockImplementation(async () => {
      await database.update(tables.orders).set({ revision: 2 }).where(eq(tables.orders.id, orderId))
    })
    const result = await uploadPdf("product_label")
    expect(result.status).toBe(400)
    expect(await result.json()).toMatchObject({ error: "PO changed during upload. Try again" })
    expect(await database.select().from(tables.documents)).toHaveLength(0)
  })
  it("preserves an existing product label when a shipment is released during its replacement", async () => {
    const prepared = await preparation()
    await database
      .update(tables.shipments)
      .set({ status: "waiting_labels", packing: prepared.packing })
      .where(eq(tables.shipments.id, prepared.id))
    expect((await uploadPdf("product_label")).status).toBe(200)
    const [original] = await database.select().from(tables.documents).where(eq(tables.documents.kind, "product_label"))
    storage.putFile.mockImplementation(async () => {
      await database.update(tables.shipments).set({ status: "ready" }).where(eq(tables.shipments.id, prepared.id))
    })
    const result = await uploadPdf("product_label")
    expect(result.status).toBe(400)
    expect(await result.json()).toMatchObject({ error: expect.stringContaining("released shipment") })
    const current = await database.select().from(tables.documents).where(eq(tables.documents.kind, "product_label"))
    expect(current).toHaveLength(1)
    expect(current[0]).toMatchObject({ id: original!.id, outdated: 0 })
  })
  it("downloads an unchanged authorized document without caching", async () => {
    const prepared = await preparation()
    await database
      .insert(tables.memberships)
      .values({ orgId: supplierId, userId: supplier.user.id, email: supplier.user.email, role: "member" })
    storage.getFile.mockResolvedValue(new Uint8Array([1, 2, 3]))
    context.actor = supplier
    const result = await downloadDocument(new Request("http://localhost"), {
      params: Promise.resolve({ id: prepared.packing.invoiceDocumentId })
    })
    expect(result.status).toBe(200)
    expect(result.headers.get("Cache-Control")).toBe("private, no-store")
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })
  it("denies unrelated document downloads before reading private storage", async () => {
    const prepared = await preparation()
    context.actor = actor("buyer", otherId)
    await expect(
      downloadDocument(new Request("http://localhost"), {
        params: Promise.resolve({ id: prepared.packing.invoiceDocumentId })
      })
    ).rejects.toThrow("not found")
    expect(storage.getFile).not.toHaveBeenCalled()
  })
  it("withholds document bytes when workspace membership is removed during storage access", async () => {
    const prepared = await preparation()
    await database
      .insert(tables.memberships)
      .values({ orgId: supplierId, userId: supplier.user.id, email: supplier.user.email, role: "member" })
    context.actor = supplier
    storage.getFile.mockImplementation(async () => {
      await database.delete(tables.memberships).where(eq(tables.memberships.userId, supplier.user.id))
      return new Uint8Array([1, 2, 3])
    })
    await expect(
      downloadDocument(new Request("http://localhost"), {
        params: Promise.resolve({ id: prepared.packing.invoiceDocumentId })
      })
    ).rejects.toThrow("Workspace access denied")
  })
  it("returns an import source only while the buyer still belongs to its workspace", async () => {
    const imported = await reviewedImport()
    await database
      .insert(tables.memberships)
      .values({ orgId: buyerId, userId: buyer.user.id, email: buyer.user.email, role: "owner" })
    storage.getFile.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const request = () =>
      downloadImportSource(new Request("http://localhost"), { params: Promise.resolve({ id: imported.id }) })
    expect((await request()).status).toBe(200)
    storage.getFile.mockImplementation(async () => {
      await database.delete(tables.memberships).where(eq(tables.memberships.userId, buyer.user.id))
      return new Uint8Array([1, 2, 3])
    })
    await expect(request()).rejects.toThrow("Workspace access denied")
  })
  it("withholds a document replaced while private storage is being read", async () => {
    const prepared = await preparation()
    storage.getFile.mockImplementation(async () => {
      await database
        .update(tables.documents)
        .set({ outdated: 1 })
        .where(eq(tables.documents.id, prepared.packing.invoiceDocumentId))
      return new Uint8Array([1])
    })
    const result = await downloadDocument(new Request("http://localhost"), {
      params: Promise.resolve({ id: prepared.packing.invoiceDocumentId })
    })
    expect(result.status).toBe(409)
    expect(await result.text()).toContain("Document changed")
  })
  it("withholds a document if release is withdrawn during storage access", async () => {
    const prepared = await preparation()
    await database
      .update(tables.shipments)
      .set({ status: "ready", packing: prepared.packing })
      .where(eq(tables.shipments.id, prepared.id))
    const [label] = await database
      .insert(tables.documents)
      .values({
        orderId,
        shipmentId: prepared.id,
        kind: "carton_label",
        cartonId: "A6",
        objectKey: "test/race-label",
        name: "Label.pdf",
        bytes: 10,
        orderRevision: 1,
        shipmentRevision: 1,
        uploadedBy: "system"
      })
      .returning()
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const bytes = await pdf.save()
    context.actor = supplier
    storage.getFile.mockImplementation(async () => {
      await database
        .update(tables.shipments)
        .set({ status: "correction", revision: 2 })
        .where(eq(tables.shipments.id, prepared.id))
      return bytes
    })
    const result = await downloadDocument(new Request("http://localhost"), {
      params: Promise.resolve({ id: label!.id })
    })
    expect(result.status).toBe(409)
  })
  it("rejects an incomplete released packet before fetching private files", async () => {
    const prepared = await preparation()
    await database
      .update(tables.shipments)
      .set({ status: "ready", packing: prepared.packing })
      .where(eq(tables.shipments.id, prepared.id))
    context.actor = supplier
    const result = await downloadPacket(new Request("http://localhost"), {
      params: Promise.resolve({ id: prepared.id })
    })
    expect(result.status).toBe(409)
    expect(await result.text()).toContain("incomplete")
    expect(storage.getFile).not.toHaveBeenCalled()
  })
  it("accepts one label sheet per variation and rejects a multipage product label", async () => {
    expect((await uploadPdf("product_label", undefined, 2)).status).toBe(400)
    expect(storage.putFile).not.toHaveBeenCalled()
    expect((await uploadPdf("product_label")).status).toBe(200)
    expect(storage.putFile).toHaveBeenCalledOnce()
  })
  it("replaces draft invoices without leaving the previous invoice current", async () => {
    const prepared = await preparation()
    context.actor = supplier
    expect((await uploadPdf("invoice", prepared.id)).status).toBe(200)
    const rows = await database.select().from(tables.documents)
    expect(rows.filter((row) => !row.outdated)).toHaveLength(1)
    expect(rows.filter((row) => row.outdated)).toHaveLength(1)
  })
  it("rejects unauthorized and unknown carton assignments before storing files", async () => {
    const prepared = await preparation()
    await database.update(tables.shipments).set({ packing: prepared.packing, status: "waiting_labels" })
    context.actor = actor("buyer", otherId)
    expect((await uploadPdf("shipping_label", prepared.id, 1, [{ cartonId: "A6", page: 1 }])).status).toBe(400)
    context.actor = buyer
    expect((await uploadPdf("shipping_label", prepared.id, 1, [{ cartonId: "unknown", page: 1 }])).status).toBe(400)
    expect(storage.putFile).not.toHaveBeenCalled()
  })
  it("requires complete current documents, assigns carrier pages and releases exactly once", async () => {
    const prepared = await preparation()
    await database.update(tables.shipments).set({
      packing: prepared.packing,
      status: "waiting_labels",
      labels: [
        {
          cartonId: "A6",
          sku: "foil-2",
          fnsku: "X000000001",
          quantity: 80,
          destinationCode: "IUSP",
          sscc: "201952611540373988",
          file: "Amazon.pdf",
          page: 1
        }
      ]
    })
    expect((await release(prepared.id)).status).toBe(400)
    for (const kind of ["packing_list", "checklist", "carton_label"] as const) {
      await database.insert(tables.documents).values({
        orderId,
        shipmentId: prepared.id,
        kind,
        cartonId: kind === "carton_label" ? "A6" : null,
        objectKey: `test/${randomUUID()}`,
        name: `${kind}.pdf`,
        bytes: 10,
        orderRevision: 1,
        shipmentRevision: 1,
        uploadedBy: "amazon"
      })
    }
    expect((await release(prepared.id)).status).toBe(400)
    expect((await uploadPdf("product_label")).status).toBe(200)
    expect((await uploadPdf("shipping_label", prepared.id, 1, [{ cartonId: "A6", page: 1 }])).status).toBe(200)
    context.actor = supplier
    expect((await release(prepared.id)).status).toBe(400)
    context.actor = buyer
    expect((await release(prepared.id, 2)).status).toBe(400)
    expect((await release(prepared.id)).status).toBe(200)
    expect((await release(prepared.id)).status).toBe(400)
    expect((await database.select().from(tables.shipments))[0]?.status).toBe("ready")
    expect((await database.select().from(tables.jobs)).filter((job) => job.key.startsWith("ready:"))).toHaveLength(1)
    expect((await uploadPdf("product_label")).status).toBe(400)
    context.actor = supplier
    const pdf = await PDFDocument.create()
    pdf.addPage([288, 432])
    const bytes = await pdf.save()
    storage.getFile.mockResolvedValue(bytes)
    const packet = () =>
      downloadPacket(new Request("http://localhost"), { params: Promise.resolve({ id: prepared.id }) })
    await database
      .insert(tables.memberships)
      .values({ orgId: supplierId, userId: supplier.user.id, email: supplier.user.email, role: "member" })
    const downloaded = await packet()
    expect(downloaded.status).toBe(200)
    expect((await PDFDocument.load(await downloaded.arrayBuffer())).getPageCount()).toBe(5)
    expect(storage.getFile).toHaveBeenCalledTimes(5)
    storage.getFile.mockImplementation(async () => {
      await database.delete(tables.memberships).where(eq(tables.memberships.userId, supplier.user.id))
      return bytes
    })
    await expect(packet()).rejects.toThrow("Workspace access denied")
    storage.getFile.mockImplementation(async () => {
      await database
        .update(tables.shipments)
        .set({ status: "correction", revision: 2 })
        .where(eq(tables.shipments.id, prepared.id))
      return bytes
    })
    const withdrawn = await packet()
    expect(withdrawn.status).toBe(409)
    expect(await withdrawn.text()).toContain("packet changed")
  })
})

describe("fluid packing handoff", () => {
  it("starts a packing draft with PO submission and resumes it on repeated create", async () => {
    await database.update(tables.orders).set({ status: "draft" })
    const submitted = await submitOrder(buyer, orderId, 1)
    const first = await newShipment(supplier, orderId)
    const second = await newShipment(supplier, orderId)
    expect(first.id).toBe(submitted.shipmentId)
    expect(second.id).toBe(first.id)
    expect(await database.select().from(tables.shipments)).toHaveLength(1)
    await expect(submitOrder(buyer, orderId, 1)).rejects.toThrow("changed")
  })
  it("saves incomplete packing without reserving stock or queueing Amazon work", async () => {
    const prepared = await preparation()
    const draft = {
      readyDate: "",
      origin: { name: "Supplier", email: "" },
      cartons: [{ cartonId: "A6", weight: 0, items: [{ itemId, pieces: 80 }] }]
    }
    const saved = await savePacking(supplier, prepared.id, draft, 1, 1)
    expect(saved.revision).toBe(2)
    const [row] = await database.select().from(tables.shipments)
    expect(row?.packing).toBeNull()
    expect(row?.packingDraft).toEqual(draft)
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    const workflow = await orderWorkflow(supplier, orderId)
    expect(workflow.items[0]?.remainingPieces).toBe(160)
    expect(workflow.shipments[0]?.next.owner).toBe("supplier")
    expect(workflow.shipments[0]?.issues.some((issue) => issue.field === "readyDate")).toBe(true)
    expect(workflow.shipments[0]?.canSubmit).toBe(false)
  })
  it("rejects stale draft saves and cross-workspace attempts without overwriting progress", async () => {
    const prepared = await preparation()
    await savePacking(supplier, prepared.id, { cartons: [] }, 1, 1)
    await expect(savePacking(supplier, prepared.id, { readyDate: "2026-10-20" }, 1, 1)).rejects.toThrow("changed")
    await expect(savePacking(supplier, prepared.id, {}, 2, 2)).rejects.toThrow("changed")
    await expect(savePacking(actor("supplier", otherId), prepared.id, {}, 2, 1)).rejects.toThrow("not found")
    expect((await database.select().from(tables.shipments))[0]?.packingDraft).toEqual({ cartons: [] })
  })
  it("checks and submits saved packing without requiring the form to be re-entered", async () => {
    const prepared = await preparation()
    await savePacking(supplier, prepared.id, prepared.packing, 1, 1)
    expect(await checkPacking(supplier, prepared.id)).toMatchObject({
      canSubmit: true,
      revision: 2,
      requiresApproval: false,
      issues: []
    })
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    await submitPacking(supplier, prepared.id, undefined, 2)
    expect((await database.select().from(tables.shipments))[0]).toMatchObject({ status: "queued", packingDraft: null })
    expect((await database.select().from(tables.jobs))[0]?.key).toBe(`amazon:${prepared.id}:2`)
    await expect(savePacking(supplier, prepared.id, {}, 2, 1)).rejects.toThrow("correction")
    await expect(newShipment(supplier, orderId)).rejects.toThrow("already assigned")
  })
  it("requires review of a changed PO before submitting saved packing", async () => {
    const prepared = await preparation()
    await savePacking(supplier, prepared.id, prepared.packing, 1, 1)
    await database.update(tables.orders).set({ revision: 2 })
    const checked = await checkPacking(supplier, prepared.id)
    expect(checked.canSubmit).toBe(false)
    expect(checked.issues).toContainEqual(expect.objectContaining({ code: "po_changed" }))
    expect((await orderWorkflow(supplier, orderId)).shipments[0]?.canSubmit).toBe(false)
    await expect(submitPacking(supplier, prepared.id, undefined, 2)).rejects.toThrow("PO changed")
    await savePacking(supplier, prepared.id, prepared.packing, 2, 2)
    await submitPacking(supplier, prepared.id, undefined, 3)
    expect((await database.select().from(tables.shipments))[0]).toMatchObject({ status: "queued", orderRevision: 2 })
  })
  it("preserves unfinished packing when a correction is requested", async () => {
    const prepared = await preparation()
    const draft = { cartons: [{ cartonId: "SUPPLIER-6", weight: 10 }] }
    await savePacking(supplier, prepared.id, draft, 1, 1)
    await correctShipment(supplier, prepared.id, "Please check the quantities")
    expect((await database.select().from(tables.shipments))[0]?.packingDraft).toEqual(draft)
  })
  it("shows partial-shipment availability and rechecks reservations at submit time", async () => {
    const first = await preparation(80)
    await submitPacking(supplier, first.id, first.packing, 1)
    const second = await preparation(160)
    await savePacking(supplier, second.id, second.packing, 1, 1)
    const readiness = await checkPacking(supplier, second.id)
    expect(readiness.items[0]?.availablePieces).toBe(80)
    expect(readiness.canSubmit).toBe(false)
    expect(readiness.issues.some((issue) => issue.message.includes("remaining"))).toBe(true)
    await expect(submitPacking(supplier, second.id, undefined, 2)).rejects.toThrow("remaining")
    expect(await database.select().from(tables.jobs)).toHaveLength(1)
  })
  it("rejects unknown draft products and never exposes private document keys", async () => {
    const prepared = await preparation()
    await expect(
      savePacking(supplier, prepared.id, { cartons: [{ items: [{ itemId: randomUUID(), pieces: 10 }] }] }, 1, 1)
    ).rejects.toThrow("not on this PO")
    const workflow = await orderWorkflow(supplier, orderId)
    expect(workflow.documents).toHaveLength(1)
    expect(workflow.documents[0]).not.toHaveProperty("objectKey")
    await expect(orderWorkflow(actor("supplier", otherId), orderId)).rejects.toThrow("not found")
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
      .mockResolvedValueOnce(call("search_shopify_products", { query: "supplier-1" }))
      .mockResolvedValueOnce(call("get_shopify_variants", { ids: [orderData.items[0]!.variantId] }))
      .mockResolvedValueOnce(call("search_amazon_listings", { skus: ["foil-2"] }))
      .mockResolvedValueOnce(call("finish_import", t.proposal))
    await importJob({ id: t.id, revision: 1 }, async () => Promise.resolve())
    expect(provider.shopifyFor).toHaveBeenCalledWith(buyerId, "test.myshopify.com")
    expect(provider.amazonFor).toHaveBeenCalledWith(buyerId, "A123456789")
    expect(storage.getFile).toHaveBeenCalledWith(`imports/${t.id}`)
    expect(await t.record()).toMatchObject({ status: "review", promptVersion: 7, tokens: 400, proposal: t.proposal })
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    expect(await database.select().from(tables.orders)).toHaveLength(1)
  })
  it("rejects model attempts to choose another account before a catalog call", async () => {
    const t = await setup()
    t.fetcher.mockResolvedValueOnce(call("search_shopify_products", { query: "cord", orgId: otherId }))
    await expect(importJob({ id: t.id, revision: 1 }, async () => Promise.resolve())).rejects.toThrow(
      "Unrecognized key"
    )
    expect(t.catalogPage).not.toHaveBeenCalled()
    expect(await t.record()).toMatchObject({ status: "failed", proposal: null })
  })
  it("does not resurrect a cancelled import when a provider response arrives late", async () => {
    const t = await setup()
    t.fetcher.mockImplementationOnce(async () => {
      await database
        .update(tables.poImports)
        .set({ status: "cancelled", revision: 2 })
        .where(eq(tables.poImports.id, t.id))
      return call("search_shopify_products", { query: "cord" })
    })
    await expect(importJob({ id: t.id, revision: 1 }, async () => Promise.resolve())).rejects.toThrow("cancelled")
    expect(await t.record()).toMatchObject({ status: "cancelled", revision: 2, proposal: null })
    expect(t.catalogPage).not.toHaveBeenCalled()
  })
  it("resumes the pinned prompt and ignores obsolete job revisions", async () => {
    const t = await setup()
    await importJob({ id: t.id, revision: 2 }, async () => Promise.resolve())
    expect(t.fetcher).not.toHaveBeenCalled()
    await database.update(tables.poImports).set({ promptVersion: 7 }).where(eq(tables.poImports.id, t.id))
    t.fetcher
      .mockResolvedValueOnce(call("search_shopify_products", { query: "foil-2" }))
      .mockResolvedValueOnce(call("finish_import", t.proposal))
    await importJob({ id: t.id, revision: 1 }, async () => Promise.resolve())
    expect(t.fetcher.mock.calls[0]![0]).toBe(
      "https://langfuse.example/api/public/v2/prompts/purchase-order-import?version=7"
    )
    expect(await t.record()).toMatchObject({ status: "review" })
  })
  it("fails a stalled catalog cursor instead of looping or accepting incomplete identities", async () => {
    const t = await setup()
    t.catalogPage.mockResolvedValue({ nodes: [], pageInfo: { hasNextPage: true, endCursor: null } })
    t.fetcher.mockResolvedValueOnce(call("search_shopify_products", { query: "cord" }))
    await expect(importJob({ id: t.id, revision: 1 }, async () => Promise.resolve())).rejects.toThrow("pagination")
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
      .mockResolvedValueOnce(call("search_shopify_products", { query: "supplier-1" }))
      .mockImplementationOnce(async (_url, init) => {
        const sent = JSON.parse(String(init?.body))
        const results = JSON.parse(sent.messages.at(-1).content)
        expect(results.results.slice(0, 2).map((v: { id: string }) => v.id)).toEqual(exact.map((v) => v.id))
        expect(results.matchesTruncated).toBe(true)
        expect(results.catalogComplete).toBe(true)
        return call("finish_import", t.proposal)
      })
    await importJob({ id: t.id, revision: 1 }, async () => Promise.resolve())
    expect(await t.record()).toMatchObject({ status: "review" })
  })
  it("leaves state untouched after the worker loses its lease", async () => {
    const t = await setup()
    const lease = vi.fn<() => Promise<void>>(async () => {
      throw new Error("Lease lost")
    })
    await expect(importJob({ id: t.id, revision: 1 }, lease)).rejects.toThrow("Lease lost")
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
      .mockResolvedValueOnce(call("search_shopify_products", { query: "foil-2" }))
      .mockResolvedValueOnce(call("finish_import", t.proposal))
    await importJob({ id: t.id, revision: 1 }, async () => Promise.resolve())
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
    expect((await uploadImport(req)).status).toBe(400)
    expect(await database.select().from(tables.poImports)).toHaveLength(0)
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
  })
  it("checks the complete prompt configuration before storing the source", async () => {
    const req = await request()
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "")
    const response = await uploadImport(req)
    expect(await response.json()).toEqual({ error: "AI import is not configured" })
    expect(storage.putFile).not.toHaveBeenCalled()
    expect(await database.select().from(tables.poImports)).toHaveLength(0)
  })
})

describe("tenant sales demand reads", () => {
  const window = () => ({
    from: new Date(Date.now() - 56 * 86400000).toISOString(),
    to: new Date(Date.now() - 300000).toISOString()
  })
  beforeEach(async () => {
    await orderConnections()
    await database.update(tables.connections).set({ scopes: "read_orders,read_locations" })
    provider.connection.mockImplementation(async (orgId: string, kind: string) => {
      const rows = await database.select().from(tables.connections)
      const row = rows.find((row) => row.orgId === orgId && row.provider === kind)
      if (!row) {
        throw new Error("not connected")
      }
      return row
    })
    provider.shopifyFor.mockResolvedValue(provider.api)
    provider.api.graphql.mockResolvedValue({
      shop: { myshopifyDomain: "test.myshopify.com" },
      orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
    })
    provider.api.request.mockResolvedValue({ orders: [] })
  })
  it("returns a complete empty result only for the current account and explicit window", async () => {
    const range = window()
    expect(await readSalesDemand(buyer, { source: "shopify", window: range })).toMatchObject({
      source: "shopify",
      externalAccountId: "test.myshopify.com",
      window: range,
      collectionComplete: true,
      attributionComplete: true,
      rows: [],
      gaps: []
    })
    expect(provider.shopifyFor).toHaveBeenCalledWith(buyerId, "test.myshopify.com")
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    expect(await database.select().from(tables.orders)).toHaveLength(1)
  })
  it("blocks unsupported history and missing grants before reading any sales", async () => {
    await expect(
      readSalesDemand(buyer, {
        source: "shopify",
        window: { ...window(), from: new Date(Date.now() - 61 * 86400000).toISOString() }
      })
    ).rejects.toThrow("60 days")
    await database.update(tables.connections).set({ scopes: "read_inventory" })
    await expect(readSalesDemand(buyer, { source: "shopify", window: window() })).rejects.toThrow("order history")
    expect(provider.api.graphql).not.toHaveBeenCalled()
  })
  it("rejects Amazon history outside retention instead of reporting zero sales", async () => {
    await expect(
      readSalesDemand(buyer, { source: "amazon", window: { from: "2020-01-01T00:00:00Z", to: "2020-01-02T00:00:00Z" } })
    ).rejects.toThrow("last two years")
    expect(provider.api.request).not.toHaveBeenCalled()
  })
  it("does not publish results if the seller changes during the provider read", async () => {
    provider.api.request.mockImplementationOnce(async () => {
      await database
        .update(tables.connections)
        .set({ externalId: "replaced" })
        .where(eq(tables.connections.provider, "amazon"))
      return { orders: [] }
    })
    await expect(readSalesDemand(buyer, { source: "amazon", window: window() })).rejects.toThrow("account changed")
    expect(provider.amazonFor).toHaveBeenCalledWith(buyerId, "A123456789")
  })
  it("rejects tenant overrides, suppliers and invalid request origins", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
    const request = (body: unknown, origin = "http://localhost:3000") =>
      new Request("http://localhost:3000/api/inventory/demand", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    const body = { source: "amazon", window: window() }
    expect((await readDemand(request({ ...body, orgId: otherId }))).status).toBe(400)
    expect((await readDemand(request(body, "https://other.example"))).status).toBe(403)
    context.actor = supplier
    expect((await readDemand(request(body))).status).toBe(403)
    expect(provider.api.request).not.toHaveBeenCalled()
  })
  it("returns safe errors and private caching rather than provider diagnostics", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
    const request = () =>
      new Request("http://localhost:3000/api/inventory/demand", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ source: "amazon", window: window() })
      })
    provider.api.request.mockRejectedValueOnce(new Error("private provider text"))
    const failed = await readDemand(request())
    expect(failed.status).toBe(503)
    expect(await failed.text()).not.toContain("private provider text")
    expect(failed.headers.get("cache-control")).toBe("private, no-store")
    expect((await readDemand(request())).status).toBe(200)
  })
})

describe("stored sales orders", () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString()
  const amazonOrder = (orderId: string, createdTime: string, quantity: number) => ({
    orderId,
    createdTime,
    salesChannel: { channelName: "AMAZON", marketplaceId: "ATVPDKIKX0DER" },
    fulfillment: { fulfillmentStatus: "SHIPPED", fulfilledBy: "AMAZON" },
    orderItems: [
      {
        orderItemId: `${orderId}-1`,
        quantityOrdered: quantity,
        product: { sellerSku: "foil-2", asin: "B000000001" },
        fulfillment: { quantityFulfilled: quantity }
      }
    ]
  })
  // Answers each Amazon read with the listed orders created in its period.
  function amazonOrders(orders: ReturnType<typeof amazonOrder>[]) {
    provider.api.request.mockImplementation(async (_method: string, path: string) => {
      const query = new URL(path, "https://amazon.test").searchParams
      const from = Date.parse(query.get("createdAfter") ?? ""),
        to = Date.parse(query.get("createdBefore") ?? "")
      return {
        orders: orders.filter((order) => Date.parse(order.createdTime) >= from && Date.parse(order.createdTime) < to)
      }
    })
  }
  beforeEach(async () => {
    await orderConnectionsAmazonOnly()
    provider.connection.mockImplementation(async (orgId: string, kind: string) => {
      const rows = await database.select().from(tables.connections)
      const row = rows.find((row) => row.orgId === orgId && row.provider === kind)
      if (!row) {
        throw new Error("not connected")
      }
      return row
    })
  })
  it("reads newest first, then keeps the stored range unbroken while refreshing and extending it", () => {
    const now = Date.parse("2026-09-25T12:00:00Z")
    const end = Date.parse("2026-09-25T11:57:00Z")
    const first = syncChunks(now, { coveredFrom: null, coveredTo: null })
    expect(first.fresh).toBe(true)
    expect(first.chunks).toHaveLength(27)
    expect(first.chunks[0]!.to.getTime()).toBe(end)
    expect(first.chunks.at(-1)!.from.getTime()).toBe(end - 365 * 86400000)
    // A full year stored until yesterday: only the last 31 days are read again.
    const later = syncChunks(now, { coveredFrom: first.chunks.at(-1)!.from, coveredTo: new Date(now - 86400000) })
    expect(later.fresh).toBe(false)
    expect(later.chunks).toHaveLength(3)
    expect(later.chunks[0]!.from.getTime()).toBe(now - 31 * 86400000)
    // 180 days stored: refresh the recent end, then extend backwards from the stored start.
    const storedFrom = new Date(end - 180 * 86400000)
    const extended = syncChunks(now, { coveredFrom: storedFrom, coveredTo: new Date(end) })
    expect(extended.chunks.slice(0, 3).map((chunk) => chunk.to.getTime() <= end)).toEqual([true, true, true])
    expect(extended.chunks[3]).toEqual({ from: new Date(storedFrom.getTime() - 14 * 86400000), to: storedFrom })
    expect(extended.chunks.at(-1)!.from.getTime()).toBe(end - 365 * 86400000)
    // A stored range entirely before the history start is replaced.
    expect(syncChunks(now, { coveredFrom: new Date(0), coveredTo: new Date(86400000) }).fresh).toBe(true)
  })
  it("copies orders, lists them and computes demand without asking Amazon again", async () => {
    amazonOrders([amazonOrder("111-1", daysAgo(10), 2), amazonOrder("111-2", daysAgo(100), 3)])
    await expect(storedDemand(buyerId, "amazon", 28)).rejects.toThrow("Sync Amazon orders")
    expect(await requestSalesSync(buyer, "amazon")).toEqual({ status: "queued" })
    expect(await requestSalesSync(buyer, "amazon")).toEqual({ status: "queued" })
    expect(await database.select().from(tables.jobs)).toHaveLength(1)
    await runNextJob()
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ status: "idle", externalAccountId: "A123456789", errorCode: null })
    expect(await listSalesOrders(buyerId, { page: 0 })).toMatchObject({
      total: 2,
      orders: [
        {
          source: "amazon",
          number: "111-1",
          units: 2,
          items: [{ sku: "foil-2", quantity: 2 }],
          channel: "Amazon FBA",
          status: "Shipped",
          url: "https://sellercentral.amazon.com/orders-v3/order/111-1"
        },
        { number: "111-2", units: 3 }
      ]
    })
    expect((await listSalesOrders(buyerId, { page: 0, q: "111-2" })).orders.map((order) => order.number)).toEqual([
      "111-2"
    ])
    expect((await listSalesOrders(buyerId, { page: 0, q: "100%" })).total).toBe(0)
    const calls = provider.api.request.mock.calls.length
    const demand = await storedDemand(buyerId, "amazon", 28)
    expect(demand.rows).toEqual([expect.objectContaining({ buyerSku: "foil-2", pool: "fba", fulfilledUnits: 2 })])
    expect(demand.window.to).toBe(sync!.coveredTo!.toISOString())
    expect((await storedDemand(buyerId, "amazon", 120)).rows[0]?.fulfilledUnits).toBe(5)
    await expect(storedDemand(buyerId, "amazon", 400)).rejects.toThrow("go back 365 days")
    expect(provider.api.request.mock.calls.length).toBe(calls)
  })
  it("drops orders that disappear from the source when the period is synced again", async () => {
    amazonOrders([amazonOrder("111-1", daysAgo(10), 2), amazonOrder("111-2", daysAgo(100), 3)])
    await requestSalesSync(buyer, "amazon")
    await runNextJob()
    amazonOrders([amazonOrder("111-2", daysAgo(100), 3)])
    const before = provider.api.request.mock.calls.length
    await requestSalesSync(buyer, "amazon")
    await runNextJob()
    expect((await listSalesOrders(buyerId, { page: 0 })).orders.map((order) => order.number)).toEqual(["111-2"])
    // Only the recent periods are read again.
    expect(provider.api.request.mock.calls.length - before).toBe(3)
  })
  it("copies daily FBA stock from Amazon's ledger and counts stockout days, except days the item sold", async () => {
    const dayMs = 86400000
    const today = Math.floor(Date.now() / dayMs) * dayMs
    const day = (ago: number) => new Date(today - ago * dayMs).toISOString().slice(0, 10)
    amazonOrders([amazonOrder("111-1", new Date(today - 3 * dayMs + 3600000).toISOString(), 2)])
    const inStock = [day(5), day(4)]
    provider.api.report.mockImplementation(async (input: { dataStartTime: string; dataEndTime: string }) => {
      const rows = inStock
        .filter((value) => value >= input.dataStartTime.slice(0, 10) && value <= input.dataEndTime.slice(0, 10))
        .map((value) => [value, "X1", "foil-2", "SELLABLE", "5"].join("\t"))
      return [["Date", "FNSKU", "MSKU", "Disposition", "Ending Warehouse Balance"].join("\t"), ...rows].join("\n")
    })
    await requestSalesSync(buyer, "amazon")
    await runNextJob()
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ stockErrorCode: null, stockCoveredTo: new Date(today) })
    const rows = await database.select().from(tables.stockDays)
    expect(rows.map((row) => [row.itemKey, row.day, row.units, row.origin])).toEqual([
      ["foil-2", day(5), 5, "ledger"],
      ["foil-2", day(4), 5, "ledger"]
    ])
    const demand = await storedDemand(buyerId, "amazon", 10)
    const out = await stockoutDays({
      orgId: buyerId,
      externalAccountId: "A123456789",
      pool: "fba",
      scope: "ATVPDKIKX0DER",
      itemKeys: ["foil-2"],
      from: new Date(today - 10 * dayMs),
      to: new Date(today),
      ledger: { from: sync!.stockCoveredFrom!, to: sync!.stockCoveredTo! },
      saleDays: demand.saleDays
    })
    // Ten days: in stock on two, sold on a third.
    expect(out.get("foil-2")).toBe(7)
  })
  it("keeps the lowest stock seen each day from stock syncs", async () => {
    const fba = (units: number) => ({
      source: "fba" as const,
      scopeKey: "ATVPDKIKX0DER" as const,
      startedAt: "2026-09-25T00:00:00Z",
      observedAt: "2026-09-25T00:00:00Z",
      rows: [
        {
          sellerSku: "foil-2",
          unit: "amazon_sellable_unit" as const,
          totalQuantity: units,
          inventoryDetails: {
            fulfillableQuantity: units,
            inboundWorkingQuantity: 0,
            inboundShippedQuantity: 0,
            inboundReceivingQuantity: 0
          }
        }
      ]
    })
    const now = Date.parse("2026-09-25T12:00:00Z")
    await recordStockDays(buyerId, "A123456789", fba(4), now)
    await recordStockDays(buyerId, "A123456789", fba(0), now + 3600000)
    await recordStockDays(buyerId, "A123456789", fba(9), now + 7200000)
    expect(await database.select().from(tables.stockDays)).toMatchObject([
      { pool: "fba", itemKey: "foil-2", day: "2026-09-25", units: 0, origin: "snapshot" }
    ])
  })
  it("records a failed sync and keeps the orders already copied", async () => {
    provider.api.request.mockRejectedValue(new Error("private provider text"))
    await requestSalesSync(buyer, "amazon")
    await runNextJob()
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ status: "failed", errorCode: "refresh_failed", coveredTo: null })
    await expect(requestSalesSync(supplier, "amazon")).rejects.toThrow("buyer workspace")
  })
})

describe("supplier lead times", () => {
  it("saves lead times only for the buyer's own current suppliers", async () => {
    await saveSupplierLeadTimes(buyerId, { id: supplierLinkId, leadTimeDays: 45, amazonLeadTimeDays: 60 })
    const [link] = await database.select().from(tables.suppliers).where(eq(tables.suppliers.id, supplierLinkId))
    expect(link).toMatchObject({ leadTimeDays: 45, amazonLeadTimeDays: 60 })
    await expect(
      saveSupplierLeadTimes(otherId, { id: supplierLinkId, leadTimeDays: 1, amazonLeadTimeDays: null })
    ).rejects.toThrow("removed")
    await expect(
      saveSupplierLeadTimes(buyerId, { id: supplierLinkId, leadTimeDays: 0, amazonLeadTimeDays: null })
    ).rejects.toThrow("expected number to be >=1")
  })
})
