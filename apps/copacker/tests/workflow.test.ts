import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { ProviderError } from "@repo/copacker-marketplaces/amazon"
import {
  type Address,
  addressSchema,
  orderInputSchema,
  packingSchema,
  buildAwdRequest,
  orderTotal,
  type Packing
} from "@repo/copacker-shipments"
import { purchaseOrderPdf } from "@repo/copacker-shipments/documents"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/workspace-session"
import { inventoryMovementReport } from "./fixtures/amazon-inventory-movements"
import { reimbursementReport } from "./fixtures/amazon-reimbursements"
import { removalReport } from "./fixtures/amazon-removals"
import { monthlyStorageReport, agedStorageReport } from "./fixtures/amazon-storage-fees"

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
    awdInboundShipment: vi.fn<(...args: never[]) => Promise<unknown>>(),
    confirm: vi.fn<(...args: never[]) => Promise<unknown>>(),
    labels: vi.fn<(...args: never[]) => Promise<unknown>>(),
    listings: vi.fn<(...args: never[]) => Promise<unknown>>(),
    stock: vi.fn<(...args: never[]) => Promise<unknown>>(),
    metafieldValues: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaStock: vi.fn<(...args: never[]) => Promise<unknown>>(),
    awdStock: vi.fn<(...args: never[]) => Promise<unknown>>(),
    salesMarketplaces: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaShipmentUnits: vi.fn<(...args: never[]) => Promise<unknown>>(),
    awdShipmentUnits: vi.fn<(...args: never[]) => Promise<unknown>>(),
    cancel: vi.fn<(...args: never[]) => Promise<unknown>>(),
    prepDetails: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaCreatePlan: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaOperation: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaPlan: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaGeneratePackingOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaPackingOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaPackingGroupItems: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaConfirmPackingOption: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaSetPacking: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaPlanBoxes: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaGeneratePlacementOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaPlacementOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaConfirmPlacementOption: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaShipment: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaShipmentBoxes: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaGenerateTransportationOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaTransportationOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaGenerateDeliveryWindowOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaDeliveryWindowOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaConfirmDeliveryWindow: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaConfirmTransportation: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaCancelPlan: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaBoxLabel: vi.fn<(...args: never[]) => Promise<unknown>>()
  }
}))
vi.mock("../src/server/connections", () => ({
  amazonFor: provider.amazonFor,
  shopifyFor: provider.shopifyFor,
  connection: provider.connection
}))
// These tests give Shopify's variants their supplier SKUs and ASINs directly; product-fields.test.ts covers Copacker
// keeping them.
vi.mock("../src/server/product-fields", async (original) => ({
  ...(await original<typeof import("../src/server/product-fields")>()),
  withVariantFields: async (_orgId: string, _domain: string, variants: unknown[]) => variants
}))
const storage = vi.hoisted(() => ({
  putFile: vi.fn<(...args: never[]) => Promise<void>>(),
  getFile: vi.fn<(key: string) => Promise<Uint8Array>>(),
  deleteFile: vi.fn<(key: string) => Promise<void>>()
}))
vi.mock("../src/server/storage", async (original) => ({
  ...(await original<typeof import("../src/server/storage")>()),
  putFile: storage.putFile,
  getFile: storage.getFile,
  deleteFile: storage.deleteFile,
  readFile: async (key: string) => ({ body: new Response(Buffer.from(await storage.getFile(key))).body! })
}))
// Documents are drawn as usual; tests can read the ship-to the purchase order was given.
vi.mock("@repo/copacker-shipments/documents", async (original) => {
  const documents = await original<typeof import("@repo/copacker-shipments/documents")>()
  return {
    ...documents,
    purchaseOrderPdf: vi.fn<typeof documents.purchaseOrderPdf>(documents.purchaseOrderPdf)
  }
})
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
// Checking a shipment's labels can be made to fail, to show sending them is tried again.
vi.mock("../src/server/readiness", async (original) => {
  const actual = await original<typeof import("../src/server/readiness")>()
  return { ...actual, releaseIssues: vi.fn<typeof actual.releaseIssues>(actual.releaseIssues) }
})

import { accessibleOrder, forwarderOrder, forwarderOrders } from "../src/server/access"
import { linkExistingAwd } from "../src/server/awd-link"
import { checkLinkedAwd } from "../src/server/awd-packing"
import { generatePo, storeDocument } from "../src/server/documents"
import { startFirstSync } from "../src/server/first-sync"
import {
  acceptForwarderInvitation,
  createForwarder,
  forwarderAddresses,
  inviteForwarder,
  saveForwarderAddress
} from "../src/server/forwarders"
import { POST as action } from "../src/server/http/api/action"
import { POST as upload } from "../src/server/http/api/documents"
import { GET as downloadDocument } from "../src/server/http/api/documents/$id"
import { POST as uploadImport } from "../src/server/http/api/imports"
import {
  GET as getImport,
  DELETE as cancelImport,
  POST as retryImport,
  PATCH as patchImport
} from "../src/server/http/api/imports/$id"
import { GET as searchImportCatalog } from "../src/server/http/api/imports/$id/catalog"
import { GET as downloadImportSource } from "../src/server/http/api/imports/$id/source"
import { GET as readInventory } from "../src/server/http/api/inventory"
import { POST as demandRoute } from "../src/server/http/api/inventory/demand"
import { GET as locationsRoute, PATCH as patchLocationRoute } from "../src/server/http/api/inventory/locations"
import { POST as refreshRoute } from "../src/server/http/api/inventory/refresh"
import { GET as downloadOrderLabels } from "../src/server/http/api/orders/$id/labels"
import { GET as downloadPo } from "../src/server/http/api/orders/$id/po"
import { GET as coverageRoute } from "../src/server/http/api/orders/summary"
import { POST as postCarrierLabels } from "../src/server/http/api/shipments/$id/carrier-labels"
import { GET as downloadPacket } from "../src/server/http/api/shipments/$id/packet"
import { importJob } from "../src/server/import-job"
import { importProposalSchema } from "../src/server/import-proposal"
import { saveImportedOrder } from "../src/server/import-save"
import { saveLocationMapping } from "../src/server/inventory-location-settings"
import { acceptSupplierInvitation } from "../src/server/invitations"
import { amazonJob, emailJob } from "../src/server/job-handlers"
import { labelsJob } from "../src/server/label-release"
import { orderLandedCosts } from "../src/server/landed-costs"
import { resolveLocalization, withLocalization } from "../src/server/localization"
import {
  approveProposal,
  declineProposal,
  proposalChanges,
  type ProposalInput,
  proposeChanges
} from "../src/server/order-proposals"
import {
  approveInvoice,
  submitPacking,
  prepareAmazonShipment,
  correctShipment,
  reopenPacking,
  createOrder,
  submitOrder,
  newShipment,
  savePacking,
  checkPacking,
  closeOrder,
  receiveShipment,
  updateDraftOrder
} from "../src/server/orders"
import { listPartners } from "../src/server/partners"
import {
  assignProductSupplier,
  lineDefaultsFor,
  readProductDefaults,
  saveProductDefaults
} from "../src/server/product-defaults"
import { productsWithoutSupplier } from "../src/server/product-suppliers"
import { ownProfile, saveProfile } from "../src/server/profile"
import { nextJobDelay, runNextJob } from "../src/server/queue"
import { releaseIssues } from "../src/server/readiness"
import { restockDefaults, restockSettings } from "../src/server/restock-report"
import { readSalesDemand } from "../src/server/sales"
import {
  listSalesOrders,
  orderSyncProgress,
  requestSalesSync,
  salesSyncStatus,
  storedDemand,
  syncChunks
} from "../src/server/sales-orders"
import { hash } from "../src/server/security"
import { shipmentPacketPage, shipmentPacketResult, releasedPacket } from "../src/server/shipment-packet"
import { shopifyOrderTags } from "../src/server/shopify-tags"
import { recordStockDays, stockoutDays } from "../src/server/stock-days"
import { saveSupplierAddress, supplierPickupAddresses } from "../src/server/supplier-addresses"
import { supplierOverview } from "../src/server/supplier-overview"
import { syncShopifySuppliers, updateSupplier } from "../src/server/suppliers"
import { orderWorkflow } from "../src/server/workflow"
import { profileFor } from "../src/server/workspace-session"
import { applySchema } from "./database"
import { drainSales } from "./drain-sales"
import { served } from "./served"

const readDemand = served(demandRoute)
const readLocations = served(locationsRoute)
const patchLocation = served(patchLocationRoute)
const refreshInventory = served(refreshRoute)
const getCoverage = served(coverageRoute)

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const buyerId = randomUUID(),
  supplierId = randomUUID(),
  otherId = randomUUID(),
  supplierLinkId = randomUUID(),
  orderId = randomUUID(),
  itemId = randomUUID()
// A week from now: finishing packing needs a ready date of today or later.
const readyDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
const orderData = orderInputSchema.parse({
  supplierId: supplierLinkId,
  reference: "PO-TEST",
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
      unitPrice: 210,
      receiver: "awd_us"
    }
  ]
})
// A PO's lines sent to the buyer's own location instead.
const warehouseLines = <T extends { receiver: string }>(items: T[]) =>
  items.map((item) => ({ ...item, receiver: "warehouse" as const }))
function actor(kind: Session["org"]["kind"], id: string): Session {
  return {
    user: { id: `user-${id}`, email: "tester@example.com", emailVerified: true, name: "Tess Tester" },
    org: {
      id,
      kind,
      name: "Test org",
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
const buyer = actor("buyer", buyerId),
  supplier = actor("supplier", supplierId)
beforeAll(async () => {
  context.current = database
  await applySchema(pg)
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
  provider.api.metafieldValues.mockResolvedValue([])
  provider.api.salesMarketplaces.mockResolvedValue(["ATVPDKIKX0DER"])
  provider.api.fbaShipmentUnits.mockResolvedValue(null)
  provider.api.awdShipmentUnits.mockResolvedValue(null)
  // Amazon's record of how the test SKUs are prepared: cords need none, and gloves are bagged and labeled by the same
  // party, the supplier.
  provider.api.prepDetails.mockResolvedValue(
    new Map([
      ["foil-2", { prepCategory: "NONE", prepOwnerConstraint: "NONE_ONLY", labelOwnerConstraint: "SELLER_ONLY" }],
      [
        "glove-6",
        {
          prepCategory: "FC_PROVIDED",
          prepOwnerConstraint: "SELLER_ONLY",
          labelOwnerConstraint: "SELLER_ONLY",
          allOwnersConstraint: "MUST_MATCH"
        }
      ]
    ])
  )
  await pg.exec("TRUNCATE organizations, jobs, profiles CASCADE")
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
    .values({ orderId, revision: 1, data: orderData, actor: buyer.user.id, reason: "created" })
})
// A supplier product row with a product of its own, as imports and the product page make them.
async function withGroup<T extends { supplierOrgId: string; title: string }>(values: T) {
  const [group] = await database
    .insert(tables.supplierProductGroups)
    .values({ supplierOrgId: values.supplierOrgId, title: values.title })
    .returning()
  return { ...values, groupId: group!.id }
}

async function preparation(pieces = 160) {
  const id = randomUUID(),
    invoiceId = randomUUID()
  await database.insert(tables.shipments).values({
    id,
    orderId,
    orderRevision: 1,
    snapshot: orderData,
    transport: {
      service: "parcel",
      handoff: "supplier",
      collection: "pickup",
      carrierLabels: "per_carton",
      instructions: ""
    }
  })
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
    readyDate,
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
  return { id, packing, invoiceId }
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
      destination: "amazon",
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
      .values(
        await withGroup({
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
      )
      .returning()
    await database.insert(tables.supplierProducts).values(
      await withGroup({
        supplierOrgId: otherId,
        supplierSku: "B-2",
        title: "Wrong supplier",
        currency: "USD",
        priceMinor: 999,
        priceBasis: "piece",
        piecesPerSellablePack: 1
      })
    )
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
describe("supplier stock", () => {
  beforeEach(orderConnections)
  async function trackedProduct(onHand: number, continueSelling = false) {
    const [product] = await database
      .insert(tables.supplierProducts)
      .values(
        await withGroup({
          supplierOrgId: supplierId,
          supplierSku: "B-2",
          title: "Foil body cord",
          currency: "USD",
          priceMinor: 105,
          trackInventory: true,
          onHand,
          continueSelling
        })
      )
      .returning()
    return product!
  }
  it("refuses POs for more than is left after other sent POs, unless the product keeps selling", async () => {
    await reviewedImport()
    // The sent PO already owes 160 pieces of B-2.
    const product = await trackedProduct(200)
    await expect(createOrder(buyer, orderData)).rejects.toThrow("B-2: 40 available, 160 ordered")
    await database
      .update(tables.supplierProducts)
      .set({ continueSelling: true })
      .where(eq(tables.supplierProducts.id, product.id))
    await expect(createOrder(buyer, orderData)).resolves.toMatchObject({ status: "draft" })
  })
  it("doesn't limit products the supplier doesn't track", async () => {
    await reviewedImport()
    await database.insert(tables.supplierProducts).values(
      await withGroup({
        supplierOrgId: supplierId,
        supplierSku: "B-2",
        title: "Foil body cord",
        currency: "USD",
        onHand: 0
      })
    )
    await expect(createOrder(buyer, orderData)).resolves.toMatchObject({ status: "draft" })
  })
  it("takes accepted invoices' pieces from stock and puts them back on correction", async () => {
    const product = await trackedProduct(200)
    const shipment = await preparation(100)
    await submitPacking(supplier, shipment.id, shipment.packing, 1)
    await prepareAmazonShipment(buyer, shipment.id, 1)
    const onHand = async () =>
      (await database.select().from(tables.supplierProducts).where(eq(tables.supplierProducts.id, product.id)))[0]
        ?.onHand
    expect(await onHand()).toBe(100)
    const [taken] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipment.id))
    expect(taken?.stockTaken).toEqual({ [product.id]: 100 })
    await correctShipment(supplier, shipment.id, "Incorrect weight")
    expect(await onHand()).toBe(200)
    const [corrected] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipment.id))
    expect(corrected?.stockTaken).toBeNull()
  })
  it("takes stock only once the buyer approves invoice changes", async () => {
    const product = await trackedProduct(200)
    const shipment = await preparation()
    shipment.packing.changes = [{ itemId, supplierSku: "B-2", unitPrice: 230 }]
    await submitPacking(supplier, shipment.id, shipment.packing, 1)
    const stock = async () =>
      (await database.select().from(tables.supplierProducts).where(eq(tables.supplierProducts.id, product.id)))[0]
        ?.onHand
    expect(await stock()).toBe(200)
    await approveInvoice(buyer, shipment.id, 1, false)
    expect(await stock()).toBe(200)
    await prepareAmazonShipment(buyer, shipment.id, 1)
    expect(await stock()).toBe(40)
  })
})
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

  it("keeps delivery addresses for buyers and pickup addresses for suppliers", async () => {
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
    // Forwarders' addresses are kept with each forwarder, on the Partners page.
    expect(await (await save("forwarder")).json()).toMatchObject({ error: expect.stringContaining("Partners page") })
    expect(await (await save("pickup")).json()).toMatchObject({ error: expect.stringContaining("Partners page") })
    context.actor = supplier
    expect((await save("pickup")).status).toBe(200)
    expect(await (await save("delivery")).json()).toMatchObject({
      error: expect.stringContaining("pickup addresses only")
    })
    const saved = await database.select({ kind: tables.contacts.kind }).from(tables.contacts)
    expect(saved.map((contact) => contact.kind).toSorted()).toEqual(["delivery", "pickup"])
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
      data: { ...orderData, supplierId: otherSupplier, items: warehouseLines(orderData.items) }
    })
    const matching = await getCoverage(
      new Request(`http://localhost/api/orders/summary?supplierId=${supplierLinkId}&destination=amazon`)
    )
    expect((await matching.json()).orders.map((order: { id: string }) => order.id)).toEqual([orderId])
    for (const filter of [`supplierId=${supplierLinkId}&destination=warehouse`, `supplierId=${randomUUID()}`]) {
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
    { status: "shipped", assigned: 40 },
    { status: "forwarded", assigned: 40 },
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
      .set({ status: "shipped", packing: first.packing })
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
      assignedByStatus: { shipped: 40, needs_attention: 60 },
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
    const params = { params: { id: imported.id } }
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
        expiresAt: new Date(Date.now() + 60000),
        contactName: "Wei Chen",
        contactEmail: "wei@supplier.example",
        website: "https://buyer-typed.example"
      })
      .where(eq(tables.suppliers.id, supplierLinkId))
    // The supplier already set its own website; the buyer's doesn't replace it.
    await database.insert(tables.supplierProfiles).values({ orgId: supplierId, website: "https://supplier.example" })
    await acceptSupplierInvitation(buyer.user, supplierId, invitation)
    const [saved] = await database.select().from(tables.suppliers)
    expect(saved?.supplierOrgId).toBe(supplierId)
    expect(saved?.invitationHash).toBeNull()
    // The buyer's contact details become the supplier's own where the supplier hadn't set them.
    const [profile] = await database.select().from(tables.supplierProfiles)
    expect(profile).toMatchObject({
      website: "https://supplier.example",
      contactName: "Wei Chen",
      contactEmail: "wei@supplier.example",
      phoneNumber: null
    })
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
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
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
      deliveryId,
      items: warehouseLines(orderData.items).map((item) => ({ ...item, fnsku: "", asin: "" }))
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
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    await prepareAmazonShipment(buyer, shipment.id, 1)
    await expect(prepareAmazonShipment(buyer, shipment.id, 1)).rejects.toThrow("changed")
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
    expect((await database.select().from(tables.jobs)).map((j) => j.kind).sort()).toEqual(["email", "shopify"])
  })
  it("finishes packing without Amazon work and lets only the buyer prepare the accepted revision", async () => {
    const shipment = await preparation()
    await submitPacking(supplier, shipment.id, shipment.packing, 1)
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    expect((await orderWorkflow(supplier, orderId)).shipments[0]).toMatchObject({
      status: "packed",
      editable: false,
      canSubmit: false,
      next: { owner: "buyer", action: "shipment.prepareAmazon" }
    })
    await expect(prepareAmazonShipment(supplier, shipment.id, 1)).rejects.toThrow("buyer workspace")
    await expect(prepareAmazonShipment(actor("buyer", otherId), shipment.id, 1)).rejects.toThrow("not found")
    await expect(prepareAmazonShipment(buyer, shipment.id, 2)).rejects.toThrow("changed")
    await database.update(tables.orders).set({ revision: 2 }).where(eq(tables.orders.id, orderId))
    await expect(prepareAmazonShipment(buyer, shipment.id, 1)).rejects.toThrow("purchase order changed")
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
  })
  it("keeps the purchase order's prices when a packer who doesn't see them submits", async () => {
    const shipment = await preparation()
    shipment.packing.changes = [{ itemId, supplierSku: "B02", unitPrice: 1 }]
    const packer: Session = { ...supplier, role: "member", access: { orders: "view", shipments: "edit" } }
    // Only the supplier SKU changes, which still goes to the buyer for approval.
    expect(await submitPacking(packer, shipment.id, shipment.packing, 1)).toEqual({ approval: true })
    const [saved] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipment.id))
    expect(saved?.packing?.changes).toEqual([{ itemId, supplierSku: "B02", unitPrice: 210 }])
  })
  it("applies invoice changes the buyer enters itself, for a supplier not on Copacker, without asking it to approve", async () => {
    const shipment = await preparation()
    await database.update(tables.suppliers).set({ supplierOrgId: null }).where(eq(tables.suppliers.id, supplierLinkId))
    shipment.packing.changes = [{ itemId, supplierSku: "B02", unitPrice: 230 }]
    expect(await submitPacking(buyer, shipment.id, shipment.packing, 1)).toEqual({ approval: false })
    const [saved] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipment.id))
    expect(saved?.status).not.toBe("approval")
    const revisions = await database.select().from(tables.orderRevisions).orderBy(tables.orderRevisions.revision)
    expect(revisions.map((r) => r.data.items[0]?.unitPrice)).toEqual([210, 230])
    // The supplier isn't on Copacker, so no revised PO is emailed.
    expect((await database.select().from(tables.jobs)).map((j) => j.kind).sort()).toEqual(["shopify"])
  })
  it("submits packing without an invoice and rejects stale shipment revisions", async () => {
    const shipment = await preparation()
    await database.delete(tables.documents).where(eq(tables.documents.orderId, orderId))
    await expect(submitPacking(supplier, shipment.id, shipment.packing, 2)).rejects.toThrow("changed")
    await expect(submitPacking(supplier, shipment.id, shipment.packing, 1)).resolves.toEqual({ approval: false })
  })
  it("invalidates documents and cancels pending work when correcting", async () => {
    const shipment = await preparation()
    await submitPacking(supplier, shipment.id, shipment.packing, 1)
    await prepareAmazonShipment(buyer, shipment.id, 1)
    await correctShipment(supplier, shipment.id, "Incorrect weight")
    const [row] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipment.id))
    expect(row?.status).toBe("correction")
    expect(row?.revision).toBe(2)
    expect((await database.select().from(tables.documents))[0]?.outdated).toBe(0)
    expect((await database.select().from(tables.jobs))[0]?.status).toBe("cancelled")
  })
})

async function queuedShipment() {
  const prepared = await preparation()
  await submitPacking(supplier, prepared.id, prepared.packing, 1)
  await prepareAmazonShipment(buyer, prepared.id, 1)
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
// Runs an action as the current actor.
async function post(name: string, data: Record<string, unknown>) {
  return action(
    new Request("http://localhost:3000/api/action", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ action: name, data })
    })
  )
}

describe("linking existing AWD shipments", () => {
  beforeEach(orderConnections)

  async function linkedDraft() {
    const draft = await preparation()
    await database.update(tables.shipments).set({ amazonNetwork: "awd_us" }).where(eq(tables.shipments.id, draft.id))
    const request = buildAwdRequest(orderData, draft.packing, "created-outside-copacker")
    const remote = {
      shipmentId: "STAR-EXTERNAL",
      orderId: "existing-order",
      shipmentStatus: "CREATED",
      originAddress: request.originAddress,
      destinationAddress: { countryCode: "US", postalCode: "92344" },
      shipmentContainerQuantities: request.packagesToInbound
    }
    provider.api.awdInboundShipment.mockResolvedValue(remote)
    return { ...draft, remote }
  }

  it("links an external shipment and retrieves labels without create, eligibility or confirmation", async () => {
    const draft = await linkedDraft()
    await linkExistingAwd(buyer, draft.id, 1, "star-external")
    await submitPacking(supplier, draft.id, draft.packing, 2)
    await prepareAmazonShipment(buyer, draft.id, 2)
    provider.api.labels.mockResolvedValue({ labelStatus: "GENERATING" })
    await expect(amazonJob({ shipmentId: draft.id, revision: 2 }, async () => undefined)).rejects.toThrow(
      "labels are generating"
    )
    await expect(amazonJob({ shipmentId: draft.id, revision: 2 }, async () => undefined)).rejects.toThrow(
      "labels are generating"
    )
    expect(provider.api.labels).toHaveBeenCalledWith("STAR-EXTERNAL")
    expect(provider.api.create).not.toHaveBeenCalled()
    expect(provider.api.eligibility).not.toHaveBeenCalled()
    expect(provider.api.confirm).not.toHaveBeenCalled()
    expect(provider.api.prepDetails).not.toHaveBeenCalled()
    const [row] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, draft.id))
    expect(row).toMatchObject({
      linkedAmazonShipmentId: "STAR-EXTERNAL",
      amazonOrderId: "existing-order",
      amazonShipmentId: "STAR-EXTERNAL"
    })
  })

  it("rejects suppliers, another workspace, stale revisions and duplicate links", async () => {
    const draft = await linkedDraft()
    await expect(linkExistingAwd(supplier, draft.id, 1, "STAR-EXTERNAL")).rejects.toThrow(/buyer|Buyer|Forbidden/)
    await expect(linkExistingAwd(actor("buyer", otherId), draft.id, 1, "STAR-EXTERNAL")).rejects.toThrow(
      /404|not.found/i
    )
    await expect(linkExistingAwd(buyer, draft.id, 2, "STAR-EXTERNAL")).rejects.toThrow("changed")
    await linkExistingAwd(buyer, draft.id, 1, "STAR-EXTERNAL")
    const second = await linkedDraft()
    await expect(linkExistingAwd(buyer, second.id, 1, "STAR-EXTERNAL")).rejects.toThrow("already linked")
    await linkExistingAwd(buyer, draft.id, 2, null)
    await expect(linkExistingAwd(buyer, second.id, 1, "STAR-EXTERNAL")).resolves.toEqual({ revision: 2 })
  })

  it("rejects shipped shipments and SKU or carton discrepancies", async () => {
    const draft = await linkedDraft()
    provider.api.awdInboundShipment.mockResolvedValue({ ...draft.remote, shipmentStatus: "CANCELLED" })
    await expect(linkExistingAwd(buyer, draft.id, 1, "STAR-EXTERNAL")).rejects.toThrow("has not shipped")
    const different = structuredClone(draft.remote)
    different.shipmentContainerQuantities[0]!.distributionPackage.contents.products[0]!.sku = "other-sku"
    provider.api.awdInboundShipment.mockResolvedValue(different)
    await expect(linkExistingAwd(buyer, draft.id, 1, "STAR-EXTERNAL")).rejects.toThrow("outside this AWD order")
    expect(() => checkLinkedAwd(different, orderData, draft.packing)).toThrow("Cartons differ")
    const overweight = structuredClone(draft.remote)
    overweight.shipmentContainerQuantities[0]!.distributionPackage.measurements.weight.weight++
    expect(() => checkLinkedAwd(overweight, orderData, draft.packing)).toThrow("Cartons differ")
    expect(() =>
      checkLinkedAwd(
        { ...draft.remote, originAddress: { ...draft.remote.originAddress, postalCode: "other" } },
        orderData,
        draft.packing
      )
    ).toThrow("pickup address differs")
    expect(() => checkLinkedAwd(draft.remote, orderData, draft.packing)).not.toThrow()
  })

  it("keeps the link through corrections and never cancels the external Amazon order", async () => {
    const draft = await linkedDraft()
    await linkExistingAwd(buyer, draft.id, 1, "STAR-EXTERNAL")
    await database
      .update(tables.shipments)
      .set({ status: "waiting_labels", operation: "complete", amazonOrderId: "existing-order", packing: draft.packing })
      .where(eq(tables.shipments.id, draft.id))
    await correctShipment(buyer, draft.id, "Fix the local packing")
    const [row] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, draft.id))
    expect(row).toMatchObject({
      status: "correction",
      operation: "none",
      linkedAmazonShipmentId: "STAR-EXTERNAL",
      amazonOrderId: null
    })
    expect(provider.api.cancel).not.toHaveBeenCalled()
  })
})

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
  it("schedules recovery at lease expiry rather than the running job's original due time", async () => {
    await queuedShipment()
    await database.update(tables.jobs).set({ status: "running", leaseAt: new Date(), runAt: new Date(0) })
    const delay = await nextJobDelay()
    expect(delay).toBeGreaterThan(590)
    expect(delay).toBeLessThanOrEqual(600)
  })
  it("schedules delayed work and stops waking after it is complete", async () => {
    await queuedShipment()
    await database.update(tables.jobs).set({ status: "pending", runAt: new Date(Date.now() + 120000) })
    expect(await nextJobDelay()).toBeGreaterThan(110)
    await database.update(tables.jobs).set({ status: "complete" })
    expect(await nextJobDelay()).toBeNull()
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

describe("leg holders shipping the goods on", () => {
  // A released shipment with its current invoice, as the supplier prints it.
  async function released(data = orderData) {
    const prepared = await preparation()
    await database
      .update(tables.shipments)
      .set({ status: "ready", packing: prepared.packing, snapshot: data })
      .where(eq(tables.shipments.id, prepared.id))
    return prepared.id
  }
  const forwarderOrg = randomUUID()
  const forwarderActor = actor("forwarder", forwarderOrg)

  it("lets the supplier mark its released goods shipped, and the buyer receive them", async () => {
    const id = await released()
    // The supplier is on Copacker, so the buyer can't ship for it, and receiving waits for the supplier.
    expect(await (await post("shipment.ship", { id })).json()).toEqual({
      error: "The supplier marks this shipment shipped"
    })
    await expect(receiveShipment(buyer, id)).rejects.toThrow("hasn’t shipped")
    context.actor = supplier
    expect((await post("shipment.ship", { id })).status).toBe(200)
    expect((await post("shipment.ship", { id })).status).toBe(400)
    expect((await orderWorkflow(supplier, orderId)).shipments[0]?.next).toMatchObject({
      owner: "buyer",
      step: "receive"
    })
    context.actor = buyer
    await receiveShipment(buyer, id)
    const events = await database.select().from(tables.events).where(eq(tables.events.orderId, orderId))
    expect(events.map((event) => event.messageKey)).toContain("supplierShipped")
  })

  it("ships independently of the PO invoice", async () => {
    const id = await released()
    await database.update(tables.documents).set({ outdated: 1 }).where(eq(tables.documents.kind, "invoice"))
    context.actor = supplier
    expect(await (await post("shipment.ship", { id })).json()).toEqual({ ok: true })
  })

  it("has the forwarder on the way ship the goods on with its freight, carrier and tracking", async () => {
    await database.insert(tables.organizations).values({ id: forwarderOrg, name: "Yiwu Logistics", kind: "forwarder" })
    const forwarder = await createForwarder({ id: buyerId, name: "Buyer" }, { name: "Yiwu Logistics", email: "" })
    const data = { ...orderData, via: { forwarderId: forwarder.id, addressId: randomUUID() } }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    const id = await released(data)
    context.actor = supplier
    expect((await post("shipment.ship", { id })).status).toBe(200)
    expect((await orderWorkflow(buyer, orderId)).shipments[0]?.next).toMatchObject({
      owner: "forwarder",
      step: "forward",
      action: "shipment.forward"
    })
    await expect(receiveShipment(buyer, id)).rejects.toThrow("forwarder hasn’t shipped")
    const forward = { id, freight: { amountMinor: 12500, currency: "USD" }, carrier: "DHL", reference: "1234567890" }
    // Until the forwarder joins, the buyer records its leg; once it has, only the forwarder does.
    context.actor = forwarderActor
    expect(await (await post("shipment.forward", forward)).json()).toEqual({
      error: "This shipment isn’t yours to ship"
    })
    await database
      .update(tables.forwarders)
      .set({ forwarderOrgId: forwarderOrg })
      .where(eq(tables.forwarders.id, forwarder.id))
    context.actor = buyer
    expect(await (await post("shipment.forward", forward)).json()).toEqual({
      error: "Yiwu Logistics marks this shipment shipped"
    })
    context.actor = forwarderActor
    expect(
      await (await post("shipment.forward", { ...forward, freight: { amountMinor: 900, currency: "CNY" } })).json()
    ).toEqual({ error: "Enter the freight in USD, the purchase order’s currency" })
    expect((await post("shipment.forward", forward)).status).toBe(200)
    const [shipped] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, id))
    expect(shipped).toMatchObject({ status: "forwarded", forwarderCarrier: "DHL", forwarderReference: "1234567890" })
    expect(await orderLandedCosts(orderId)).toEqual([
      expect.objectContaining({
        kind: "freight",
        description: "Yiwu Logistics freight, DHL 1234567890",
        amountMinor: 12500
      })
    ])
    context.actor = buyer
    await receiveShipment(buyer, id)
  })

  it("shows a joined forwarder the POs passing through it, read-only, and nothing else", async () => {
    await database.insert(tables.organizations).values({ id: forwarderOrg, name: "Yiwu Logistics", kind: "forwarder" })
    const forwarder = await createForwarder({ id: buyerId, name: "Buyer" }, { name: "Yiwu Logistics", email: "" })
    expect(await forwarderOrders(forwarderActor)).toEqual([])
    await database
      .update(tables.forwarders)
      .set({ forwarderOrgId: forwarderOrg })
      .where(eq(tables.forwarders.id, forwarder.id))
    expect(await forwarderOrders(forwarderActor)).toEqual([])
    const data = { ...orderData, via: { forwarderId: forwarder.id, addressId: randomUUID() } }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    expect((await forwarderOrders(forwarderActor)).map((row) => [row.order.id, row.forwarder.name])).toEqual([
      [orderId, "Yiwu Logistics"]
    ])
    // Supplier actions stay closed to it.
    await expect(accessibleOrder(forwarderActor, orderId)).rejects.toThrow("not found")
    await database
      .update(tables.forwarders)
      .set({ removedAt: new Date() })
      .where(eq(tables.forwarders.id, forwarder.id))
    await expect(forwarderOrder(forwarderActor, orderId)).rejects.toThrow("not found")
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
    const ready = await shipment("shipped")
    const unpacked = await shipment("packing")
    await expect(closeOrder(buyer, orderId)).rejects.toThrow("still in progress")
    await expect(receiveShipment(supplier, ready)).rejects.toThrow("buyer workspace")
    await receiveShipment(buyer, ready)
    await expect(receiveShipment(buyer, ready)).rejects.toThrow("hasn’t shipped")
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

// A PDF of blank label-sized pages.
async function blankPdf(pages: number, name = "Labels.pdf") {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    pdf.addPage([288, 432])
  }
  return new File([Buffer.from(await pdf.save())], name, { type: "application/pdf" })
}
async function uploadPdf(kind: "invoice" | "product_label", pages = 1) {
  const form = new FormData()
  form.set("orderId", orderId)
  form.set("kind", kind)
  form.set("file", await blankPdf(pages))
  if (kind === "product_label") {
    form.set("itemId", itemId)
  }
  return upload(
    new Request("http://localhost:3000/api/documents", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: form
    })
  )
}
// A UPS tracking number as its label prints it, in groups, and as it's stored, without the spaces.
const printed = (n: number) => `1Z 999 AA1 01 2345 678${n}`
const trackingNumber = (n: number) => `1Z999AA1012345678${n}`
// Saves a shipment's carrier labels as the Upload carrier labels dialog does: carrier PDFs of the given page counts,
// and each carton's label, either a page of one of them or the label the carton already has.
async function uploadCarrierLabels(shipmentId: string, labels: unknown[], files: number[] = [], revision = 1) {
  const form = new FormData()
  form.set("revision", String(revision))
  form.set("labels", JSON.stringify(labels))
  for (const [index, pages] of files.entries()) {
    form.append("file", await blankPdf(pages, `Carrier ${index + 1}.pdf`))
  }
  return postCarrierLabels(
    new Request(`http://localhost:3000/api/shipments/${shipmentId}/carrier-labels`, {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: form
    }),
    { params: { id: shipmentId } }
  )
}
// The current carrier labels of every shipment.
async function carrierLabels() {
  return database
    .select()
    .from(tables.documents)
    .where(and(eq(tables.documents.kind, "shipping_label"), eq(tables.documents.outdated, 0)))
}
// The shipment's status and what its packet still lacks, as the buyer sees them.
async function shipmentState(id: string) {
  const shipment = (await orderWorkflow(buyer, orderId)).shipments.find((row) => row.id === id)!
  return { status: shipment.status, issues: shipment.issues.map((issue) => issue.code) }
}
describe("transport configuration", () => {
  const agl = {
    service: "agl",
    handoff: "supplier",
    collection: "pickup",
    carrierLabels: "none",
    instructions: ""
  } as const
  it("requires buyer access, rejects missing stops and stale settings, and locks released transport", async () => {
    const draft = await preparation()
    await database.update(tables.shipments).set({ transport: null }).where(eq(tables.shipments.id, draft.id))
    const input = { id: draft.id, revision: 1, expected: null, transport: agl }
    context.actor = supplier
    expect((await post("shipment.transport", input)).status).toBe(403)
    context.actor = buyer
    expect((await post("shipment.transport", { ...input, transport: { ...agl, handoff: "forwarder" } })).status).toBe(
      400
    )
    expect((await post("shipment.transport", input)).status).toBe(200)
    expect((await post("shipment.transport", input)).status).toBe(400)
    await database.update(tables.shipments).set({ status: "ready" }).where(eq(tables.shipments.id, draft.id))
    expect((await post("shipment.transport", { ...input, expected: agl })).status).toBe(400)
  })
  it.each(["ready", "shipped", "forwarded", "received"] as const)(
    "confirms missing transport on a %s shipment once without reopening packing",
    async (status) => {
      const draft = await preparation()
      await database.update(tables.shipments).set({ status, transport: null }).where(eq(tables.shipments.id, draft.id))
      const input = { id: draft.id, revision: 1, expected: null, transport: agl }
      context.actor = supplier
      expect((await post("shipment.transport", input)).status).toBe(403)
      context.actor = buyer
      expect((await post("shipment.transport", input)).status).toBe(200)
      expect((await post("shipment.transport", { ...input, expected: agl })).status).toBe(400)
      const [saved] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, draft.id))
      expect(saved).toMatchObject({ status, transport: agl, revision: 1 })
    }
  )
  it("sends AGL labels to the supplier once transport is saved, but still waits for Amazon labels and parcel labels", async () => {
    const prepared = await preparation()
    await database
      .update(tables.shipments)
      .set({
        status: "waiting_labels",
        packing: prepared.packing,
        transport: null,
        labels: [
          { cartonId: "A6", labelNumber: "201952611540373988", destinationCode: "IUSP", amazonShipmentId: "STAR-1" }
        ]
      })
      .where(eq(tables.shipments.id, prepared.id))
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
        uploadedBy: "system"
      })
    }
    // Amazon's carton label is replaced, and its new one hasn't arrived.
    await database.update(tables.documents).set({ outdated: 1 }).where(eq(tables.documents.kind, "carton_label"))
    expect(await shipmentState(prepared.id)).toEqual({
      status: "waiting_labels",
      issues: ["missing_carton_label", "missing_transport"]
    })
    expect(
      (await post("shipment.transport", { id: prepared.id, revision: 1, expected: null, transport: agl })).status
    ).toBe(200)
    expect(await shipmentState(prepared.id)).toEqual({ status: "waiting_labels", issues: ["missing_carton_label"] })
    // With its carton label back, AGL that wants carrier labels still waits for them.
    expect(
      (
        await post("shipment.transport", {
          id: prepared.id,
          revision: 1,
          expected: agl,
          transport: { ...agl, carrierLabels: "per_carton" }
        })
      ).status
    ).toBe(200)
    await database.update(tables.documents).set({ outdated: 0 }).where(eq(tables.documents.kind, "carton_label"))
    expect(await shipmentState(prepared.id)).toEqual({ status: "waiting_labels", issues: ["missing_shipping_label"] })
    // AGL without them completes the packet, and the labels go to the supplier.
    expect(
      (
        await post("shipment.transport", {
          id: prepared.id,
          revision: 1,
          expected: { ...agl, carrierLabels: "per_carton" },
          transport: agl
        })
      ).status
    ).toBe(200)
    expect(await shipmentState(prepared.id)).toEqual({ status: "ready", issues: [] })
    const events = await database.select().from(tables.events).where(eq(tables.events.orderId, orderId))
    expect(events).toMatchObject([{ messageKey: "labelsReleased", actor: buyer.user.id }])
  })
  // A shipment on AGL, which needs no carrier labels, whose Amazon labels are ready to download.
  async function labelsReady() {
    const shipment = await queuedShipment()
    await database
      .update(tables.shipments)
      .set({ transport: agl, amazonOrderId: shipment.remote.orderId, operation: "created" })
      .where(eq(tables.shipments.id, shipment.id))
    provider.api.order.mockResolvedValue({
      ...shipment.remote,
      orderStatus: "CONFIRMED",
      destinationDetails: { shipmentId: "STAR-SHIPMENT" }
    })
    provider.api.labels.mockResolvedValue({
      labelStatus: "GENERATED",
      labelDownloadURL: "https://awd-labels.s3.amazonaws.com/STAR-SHIPMENT.pdf"
    })
    const label = await amazonCartonLabels([
      [
        "FNSKU#:",
        "MSKU#:",
        "QTY: 80",
        "X000000001",
        "foil-2",
        "DC: IUSP",
        "Serial Shipping Container Code (SSCC)",
        "201952611540373988"
      ]
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(Buffer.from(label)))
    )
    return shipment
  }
  it("sends a shipment that needs no carrier labels to its supplier as soon as Amazon's labels arrive", async () => {
    const shipment = await labelsReady()
    await amazonJob({ shipmentId: shipment.id, revision: 1 }, async () => undefined)
    expect(await shipmentState(shipment.id)).toEqual({ status: "ready", issues: [] })
    const emailed = await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "email"))
    expect(emailed.map((job) => job.payload)).toEqual([
      { type: "ready", to: "supplier@example.com", orderId, shipmentId: shipment.id }
    ])
    // Sent, the job queued in case they weren't is gone.
    expect(await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "labels"))).toEqual([])
    const events = await database.select().from(tables.events).where(eq(tables.events.orderId, orderId))
    expect(events).toContainEqual(expect.objectContaining({ messageKey: "labelsReleased", actor: "amazon" }))
  })
  it("tries the labels again when they fail to go as Amazon's arrive", async () => {
    const shipment = await labelsReady()
    vi.mocked(releaseIssues).mockImplementationOnce(() => {
      throw new Error("Database unavailable")
    })
    await amazonJob({ shipmentId: shipment.id, revision: 1 }, async () => undefined)
    expect(await shipmentState(shipment.id)).toMatchObject({ status: "waiting_labels" })
    const [queued] = await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "labels"))
    expect(queued).toMatchObject({ status: "pending", payload: { shipmentId: shipment.id, actor: "amazon" } })
    await labelsJob(queued!.payload)
    expect(await shipmentState(shipment.id)).toEqual({ status: "ready", issues: [] })
    const events = await database.select().from(tables.events).where(eq(tables.events.orderId, orderId))
    expect(events).toContainEqual(expect.objectContaining({ messageKey: "labelsReleased", actor: "amazon" }))
  })
})

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
    await expect(
      storeDocument(
        {
          orderId,
          shipmentId: prepared.id,
          kind: "packing_list",
          name: "Packing list.pdf",
          orderRevision: 1,
          shipmentRevision: 1,
          uploadedBy: "system"
        },
        new Uint8Array([2])
      )
    ).rejects.toThrow("Storage unavailable")
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
  it("keeps one current PO document as the PO is revised", async () => {
    const po = { orderId, kind: "purchase_order" as const, name: "PO.pdf", uploadedBy: "system" }
    const first = await storeDocument({ ...po, orderRevision: 1 }, new Uint8Array([1]))
    await database.update(tables.orders).set({ revision: 2 }).where(eq(tables.orders.id, orderId))
    const second = await storeDocument({ ...po, orderRevision: 2 }, new Uint8Array([2]))
    // A late copy of revision 1 doesn't replace revision 2's.
    await storeDocument({ ...po, orderRevision: 1 }, new Uint8Array([3]))
    const current = await database
      .select()
      .from(tables.documents)
      .where(and(eq(tables.documents.kind, "purchase_order"), eq(tables.documents.outdated, 0)))
    expect(current.map((doc) => doc.id)).toEqual([second.id])
    expect(first.id).not.toBe(second.id)
  })
  it("rejects an invoice upload if the PO changes during storage, preserving the current invoice", async () => {
    const prepared = await preparation()
    context.actor = supplier
    storage.putFile.mockImplementation(async () => {
      await database.update(tables.orders).set({ revision: 2 }).where(eq(tables.orders.id, orderId))
    })
    const result = await uploadPdf("invoice")
    expect(result.status).toBe(400)
    expect(await result.json()).toMatchObject({ error: "The purchase order changed during upload. Try again." })
    const docs = await database.select().from(tables.documents)
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ id: prepared.invoiceId, outdated: 0 })
  })
  it("rejects carrier labels when the shipment is released during upload", async () => {
    const prepared = await preparation()
    await database
      .update(tables.shipments)
      .set({ status: "waiting_labels", packing: prepared.packing })
      .where(eq(tables.shipments.id, prepared.id))
    const keys: string[] = []
    storage.putFile.mockImplementation(async (key: string) => {
      keys.push(key)
      await database.update(tables.shipments).set({ status: "ready" }).where(eq(tables.shipments.id, prepared.id))
    })
    const result = await uploadCarrierLabels(
      prepared.id,
      [{ cartonId: "A6", file: 0, page: 1, trackingNumber: printed(1) }],
      [1]
    )
    expect(result.status).toBe(400)
    expect(await result.json()).toMatchObject({ error: "Shipment changed during upload. Try again." })
    expect(await carrierLabels()).toEqual([])
    // The page it stored is removed again.
    expect(keys).toHaveLength(1)
    expect(storage.deleteFile.mock.calls).toEqual(keys.map((key) => [key]))
  })
  it("rejects product labels when the PO changes during upload", async () => {
    storage.putFile.mockImplementation(async () => {
      await database.update(tables.orders).set({ revision: 2 }).where(eq(tables.orders.id, orderId))
    })
    const result = await uploadPdf("product_label")
    expect(result.status).toBe(400)
    expect(await result.json()).toMatchObject({ error: "The purchase order changed during upload. Try again." })
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
  it("downloads the filed purchase order rather than filing another", async () => {
    const filed = await generatePo(orderId)
    storage.getFile.mockResolvedValue(new Uint8Array([4, 5, 6]))
    const result = await downloadPo(new Request("http://localhost"), { params: { id: orderId } })
    expect(result.status).toBe(200)
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]))
    expect(storage.getFile).toHaveBeenCalledWith(filed.doc.objectKey)
    // The download leaves the purchase order's page linking to the same document.
    expect(await database.select().from(tables.documents)).toEqual([filed.doc])
  })
  it("downloads an unchanged authorized document without caching", async () => {
    const prepared = await preparation()
    await database.insert(tables.memberships).values({
      orgId: supplierId,
      userId: supplier.user.id,
      email: supplier.user.email,
      role: "member",
      access: { shipments: "view", prices: "view" }
    })
    storage.getFile.mockResolvedValue(new Uint8Array([1, 2, 3]))
    context.actor = supplier
    const result = await downloadDocument(new Request("http://localhost"), {
      params: { id: prepared.invoiceId }
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
        params: { id: prepared.invoiceId }
      })
    ).rejects.toThrow("not found")
    expect(storage.getFile).not.toHaveBeenCalled()
  })
  it("withholds document bytes when workspace membership is removed during storage access", async () => {
    const prepared = await preparation()
    await database.insert(tables.memberships).values({
      orgId: supplierId,
      userId: supplier.user.id,
      email: supplier.user.email,
      role: "member",
      access: { shipments: "view", prices: "view" }
    })
    context.actor = supplier
    storage.getFile.mockImplementation(async () => {
      await database.delete(tables.memberships).where(eq(tables.memberships.userId, supplier.user.id))
      return new Uint8Array([1, 2, 3])
    })
    await expect(
      downloadDocument(new Request("http://localhost"), {
        params: { id: prepared.invoiceId }
      })
    ).rejects.toThrow("You don’t have access to this workspace")
  })
  it("returns an import source only while the buyer still belongs to its workspace", async () => {
    const imported = await reviewedImport()
    await database
      .insert(tables.memberships)
      .values({ orgId: buyerId, userId: buyer.user.id, email: buyer.user.email, role: "owner" })
    storage.getFile.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const request = () => downloadImportSource(new Request("http://localhost"), { params: { id: imported.id } })
    expect((await request()).status).toBe(200)
    storage.getFile.mockImplementation(async () => {
      await database.delete(tables.memberships).where(eq(tables.memberships.userId, buyer.user.id))
      return new Uint8Array([1, 2, 3])
    })
    await expect(request()).rejects.toThrow("You don’t have access to this workspace")
  })
  it("withholds a document replaced while private storage is being read", async () => {
    const prepared = await preparation()
    storage.getFile.mockImplementation(async () => {
      await database.update(tables.documents).set({ outdated: 1 }).where(eq(tables.documents.id, prepared.invoiceId))
      return new Uint8Array([1])
    })
    const result = await downloadDocument(new Request("http://localhost"), {
      params: { id: prepared.invoiceId }
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
    await database.insert(tables.memberships).values({
      orgId: supplierId,
      userId: supplier.user.id,
      email: supplier.user.email,
      role: "member",
      access: { shipments: "view" }
    })
    storage.getFile.mockImplementation(async () => {
      await database
        .update(tables.shipments)
        .set({ status: "correction", revision: 2 })
        .where(eq(tables.shipments.id, prepared.id))
      return bytes
    })
    const result = await downloadDocument(new Request("http://localhost"), {
      params: { id: label!.id }
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
    const result = await downloadPacket(new Request("http://localhost?section=carton_labels"), {
      params: { id: prepared.id }
    })
    expect(result.status).toBe(409)
    expect(await result.text()).toContain("incomplete")
    expect(storage.getFile).not.toHaveBeenCalled()
  })
  it("accepts one label sheet per variation and rejects a multipage product label", async () => {
    expect((await uploadPdf("product_label", 2)).status).toBe(400)
    expect(storage.putFile).not.toHaveBeenCalled()
    expect((await uploadPdf("product_label")).status).toBe(200)
    expect(storage.putFile).toHaveBeenCalledOnce()
  })
  it("replaces draft invoices without leaving the previous invoice current", async () => {
    // The shipment brings the current invoice.
    await preparation()
    context.actor = supplier
    expect((await uploadPdf("invoice")).status).toBe(200)
    const rows = await database.select().from(tables.documents)
    expect(rows.filter((row) => !row.outdated)).toHaveLength(1)
    expect(rows.filter((row) => row.outdated)).toHaveLength(1)
  })
  it("refuses carrier labels from another workspace, for unknown cartons, a carton or label twice or a missing page", async () => {
    const prepared = await preparation()
    const [carton] = prepared.packing.cartons
    await database.update(tables.shipments).set({
      packing: { ...prepared.packing, cartons: [carton!, { ...carton!, cartonId: "A7" }] },
      status: "waiting_labels"
    })
    const label = { cartonId: "A6", file: 0, page: 1, trackingNumber: printed(1) }
    const refused = async (labels: unknown[], files = [1]) => {
      const result = await uploadCarrierLabels(prepared.id, labels, files)
      expect(result.status).not.toBe(200)
      return (await result.json()).error
    }
    context.actor = actor("buyer", otherId)
    expect(await refused([label])).toContain("not found")
    context.actor = buyer
    expect(await refused([{ ...label, cartonId: "unknown" }])).toBe("Label assignment has an unknown carton or page")
    expect(await refused([label, { ...label, page: 2 }], [2])).toBe("Assign each label page and carton only once")
    expect(await refused([label, { ...label, cartonId: "A7", trackingNumber: printed(2) }])).toBe(
      "Assign each label page and carton only once"
    )
    expect(await refused([label, { ...label, cartonId: "A7", page: 2 }], [2])).toBe(
      "Assign each label page and carton only once"
    )
    expect(await refused([{ ...label, page: 2 }])).toBe("Label assignment has an unknown carton or page")
    expect(storage.putFile).not.toHaveBeenCalled()
    expect(await carrierLabels()).toEqual([])
  })
  it("builds the supplier's AGL packet from the released snapshot and verified destination", async () => {
    const prepared = await preparation()
    const snapshot = {
      ...orderData,
      items: orderData.items.map((item) => ({
        ...item,
        supplierSku: "SUP-2",
        packingRequirements: { preparation: "sealedPolybag" as const, labels: [], countryCode: "", instructions: "" }
      }))
    }
    await database
      .update(tables.shipments)
      .set({
        packing: prepared.packing,
        snapshot,
        status: "ready",
        amazonNetwork: "awd_us",
        amazonShipmentId: "STAR-EXAMPLE",
        transport: {
          service: "agl",
          handoff: "supplier",
          collection: "pickup",
          carrierLabels: "none",
          instructions: ""
        },
        labels: [
          {
            cartonId: "A6",
            labelNumber: "201952611540373988",
            destinationCode: "IUSP",
            amazonShipmentId: "STAR-EXAMPLE"
          }
        ]
      })
      .where(eq(tables.shipments.id, prepared.id))
    await database.insert(tables.documents).values({
      orderId,
      shipmentId: prepared.id,
      kind: "carton_label",
      cartonId: "A6",
      objectKey: "test/agl-label",
      name: "Label.pdf",
      bytes: 10,
      orderRevision: 1,
      shipmentRevision: 1,
      uploadedBy: "amazon"
    })
    await database.insert(tables.memberships).values({
      orgId: supplierId,
      userId: supplier.user.id,
      email: supplier.user.email,
      role: "member",
      access: { shipments: "view" }
    })
    provider.api.awdInboundShipment.mockResolvedValue({
      shipmentId: "STAR-EXAMPLE",
      destinationAddress: { ...prepared.packing.origin, name: "Amazon IUSP", countryCode: "US" }
    })
    const page = await shipmentPacketPage(supplier, prepared.id)
    expect(page.data.transport).toMatchObject({ service: "agl", collection: "pickup", carrierLabels: false })
    expect(page.data.destination.name).toBe("Amazon IUSP")
    expect(page.data.products[0]).toMatchObject({ supplierSku: "SUP-2", tasks: ["sealedPolybag"] })
    expect(page.data.products[0]).not.toHaveProperty("buyerSku")
    expect(page.data.products[0]).not.toHaveProperty("unitPrice")
    expect(page.hasProductLabels).toBe(false)
    await database
      .update(tables.orders)
      .set({ data: { ...orderData, reference: "EDITED-LIVE-PO" } })
      .where(eq(tables.orders.id, orderId))
    expect((await shipmentPacketPage(supplier, prepared.id)).data.order).toBe(snapshot.reference)
    await expect(releasedPacket(supplier, prepared.id, page.version)).resolves.toHaveProperty("version", page.version)
    provider.api.awdInboundShipment.mockResolvedValue({
      shipmentId: "SOME-OTHER-SHIPMENT",
      destinationAddress: prepared.packing.origin
    })
    await expect(shipmentPacketPage(supplier, prepared.id)).rejects.toMatchObject({
      key: "packetDestinationUnavailable"
    })
    expect(await shipmentPacketResult(supplier, prepared.id)).toMatchObject({
      unavailable: true,
      labelSections: ["carton_labels"]
    })
    await database
      .update(tables.shipments)
      .set({
        transport: {
          ...page.data.transport,
          service: "agl",
          handoff: "supplier",
          collection: "pickup",
          carrierLabels: "none",
          instructions: "Updated handoff"
        }
      })
      .where(eq(tables.shipments.id, prepared.id))
    await expect(releasedPacket(supplier, prepared.id, page.version)).rejects.toMatchObject({ key: "packetChanged" })
  })
  it("waits for complete current documents, assigns carrier pages and sends the labels exactly once", async () => {
    const prepared = await preparation()
    await database.update(tables.shipments).set({
      packing: prepared.packing,
      status: "waiting_labels",
      labels: [
        {
          cartonId: "A6",
          labelNumber: "201952611540373988",
          destinationCode: "IUSP",
          amazonShipmentId: "STAR-EXAMPLE"
        }
      ]
    })
    expect((await uploadPdf("product_label")).status).toBe(200)
    const label = { cartonId: "A6", file: 0, page: 1, trackingNumber: printed(1) }
    // Only the buyer adds carrier labels, to the shipment as it last saw it.
    context.actor = supplier
    expect((await uploadCarrierLabels(prepared.id, [label], [1])).status).toBe(403)
    context.actor = buyer
    expect((await uploadCarrierLabels(prepared.id, [label], [1], 2)).status).toBe(400)
    // Amazon's carton label hasn't arrived, so the carrier label alone doesn't complete the packet.
    const saved = await uploadCarrierLabels(prepared.id, [label], [1])
    expect(await saved.json()).toEqual({ sent: false })
    expect(await carrierLabels()).toMatchObject([
      {
        shipmentId: prepared.id,
        cartonId: "A6",
        trackingNumber: trackingNumber(1),
        sourceName: "Carrier 1.pdf",
        // A one-page file is known by its name alone.
        sourcePage: null,
        name: "Carrier label - A6.pdf"
      }
    ])
    expect(await shipmentState(prepared.id)).toEqual({ status: "waiting_labels", issues: ["missing_carton_label"] })
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
    // Saved again with its carrier label kept, the packet is complete and goes to the supplier, once.
    const [kept] = await carrierLabels()
    const keep = [{ cartonId: "A6", documentId: kept!.id, trackingNumber: printed(1) }]
    expect(await (await uploadCarrierLabels(prepared.id, keep)).json()).toEqual({ sent: true })
    expect((await uploadCarrierLabels(prepared.id, keep)).status).toBe(400)
    expect((await database.select().from(tables.shipments))[0]?.status).toBe("ready")
    expect((await database.select().from(tables.jobs)).filter((job) => job.key.startsWith("ready:"))).toHaveLength(1)
    expect((await uploadPdf("product_label")).status).toBe(400)
    context.actor = supplier
    const pdf = await PDFDocument.create()
    pdf.addPage([288, 432])
    const bytes = await pdf.save()
    storage.getFile.mockResolvedValue(bytes)
    const packet = (section = "carton_labels") =>
      downloadPacket(new Request(`http://localhost?section=${section}`), { params: { id: prepared.id } })
    await database.insert(tables.memberships).values({
      orgId: supplierId,
      userId: supplier.user.id,
      email: supplier.user.email,
      role: "member",
      access: { shipments: "view", prices: "view" }
    })
    // The product label is made from the product now; Shopify has no country of origin for it.
    provider.shopifyFor.mockResolvedValue({ variants: async () => [] })
    const downloaded = await packet()
    expect(downloaded.status).toBe(200)
    // Original provider artwork retains its page size. References are rendered by the packet page.
    expect((await PDFDocument.load(await downloaded.arrayBuffer())).getPageCount()).toBe(1)
    expect(storage.getFile).toHaveBeenCalledTimes(1)
    const cartonLabels = await packet("carton_labels")
    expect(cartonLabels.status).toBe(200)
    expect(decodeURIComponent(cartonLabels.headers.get("Content-Disposition")!)).toContain(
      `Carton labels - ${orderData.reference} - ${prepared.id} - rev 1.pdf`
    )
    const cartonPdf = await PDFDocument.load(await cartonLabels.arrayBuffer())
    expect(cartonPdf.getPageCount()).toBe(1)
    expect(cartonPdf.getPage(0).getSize()).toEqual({ width: 288, height: 432 })
    const productLabels = await packet("product_labels")
    expect(productLabels.status).toBe(200)
    expect(decodeURIComponent(productLabels.headers.get("Content-Disposition")!)).toContain(
      `Product labels - ${orderData.reference} - ${prepared.id} - rev 1.pdf`
    )
    expect((await PDFDocument.load(await productLabels.arrayBuffer())).getPageCount()).toBe(1)
    expect((await packet("unknown")).status).toBe(400)
    storage.getFile.mockImplementation(async () => {
      await database.delete(tables.memberships).where(eq(tables.memberships.userId, supplier.user.id))
      return bytes
    })
    await expect(packet()).rejects.toThrow("You don’t have access to this workspace")
    await database.insert(tables.memberships).values({
      orgId: supplierId,
      userId: supplier.user.id,
      email: supplier.user.email,
      role: "member",
      access: { shipments: "view" }
    })
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
  it("emails the labels only to a supplier that has joined", async () => {
    // A shipment waiting for its carrier label, with every other document its packet needs.
    const releasable = async () => {
      const prepared = await preparation()
      await database
        .update(tables.shipments)
        .set({
          status: "waiting_labels",
          packing: prepared.packing,
          labels: [
            { cartonId: "A6", labelNumber: "201952611540373988", destinationCode: "IUSP", amazonShipmentId: "STAR-1" }
          ]
        })
        .where(eq(tables.shipments.id, prepared.id))
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
      return prepared.id
    }
    // The buyer's carrier label completes the packet, which goes to the supplier.
    const complete = async (id: string) =>
      (await uploadCarrierLabels(id, [{ cartonId: "A6", file: 0, page: 1, trackingNumber: printed(1) }], [1])).json()
    const joined = await releasable()
    expect(await complete(joined)).toEqual({ sent: true })
    // A supplier that hasn't joined can't open the shipment the email links to, and may have no email address at all.
    // Its shipment is released all the same, and the buyer shares the packet.
    for (const email of ["supplier@example.com", null]) {
      await database
        .update(tables.suppliers)
        .set({ supplierOrgId: null, email })
        .where(eq(tables.suppliers.id, supplierLinkId))
      expect(await complete(await releasable())).toEqual({ sent: true })
    }
    // The timeline says who passes the packet on.
    const released = await database.select().from(tables.events).orderBy(tables.events.createdAt)
    expect(released.map((event) => event.messageKey)).toEqual([
      "labelsReleased",
      "labelsReleasedToShare",
      "labelsReleasedToShare"
    ])
    const emailed = await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "email"))
    expect(emailed.map((job) => job.payload)).toEqual([
      { type: "ready", to: "supplier@example.com", orderId, shipmentId: joined }
    ])
    // The worker sends what the release queued.
    vi.stubEnv("APP_URL", "https://copacker.example")
    vi.stubEnv("EMAIL_API_KEY", "test")
    vi.stubEnv("EMAIL_FROM", "copacker@example.com")
    const send = vi.fn<typeof fetch>(async () => Response.json({ id: "sent" }))
    vi.stubGlobal("fetch", send)
    await emailJob(emailed[0]!.payload, emailed[0]!.key, async () => undefined)
    expect(JSON.parse(String(send.mock.calls[0]![1]!.body))).toMatchObject({ to: ["supplier@example.com"] })
  })
  it("keeps carrier labels saved for some cartons, and sends them once every carton has one", async () => {
    const prepared = await preparation(80)
    // Two cartons of the PO's cords, each with Amazon's carton label.
    const packing = {
      ...prepared.packing,
      cartons: ["A1", "A2"].map((cartonId) => ({ ...prepared.packing.cartons[0]!, cartonId }))
    }
    await database
      .update(tables.shipments)
      .set({
        status: "waiting_labels",
        packing,
        labels: packing.cartons.map((carton, index) => ({
          cartonId: carton.cartonId,
          labelNumber: `20195261154037398${index}`,
          destinationCode: "IUSP",
          amazonShipmentId: "STAR-1"
        }))
      })
      .where(eq(tables.shipments.id, prepared.id))
    for (const carton of packing.cartons) {
      await database.insert(tables.documents).values({
        orderId,
        shipmentId: prepared.id,
        kind: "carton_label",
        cartonId: carton.cartonId,
        objectKey: `test/${randomUUID()}`,
        name: "carton_label.pdf",
        bytes: 10,
        orderRevision: 1,
        shipmentRevision: 1,
        uploadedBy: "amazon"
      })
    }
    // The buyer has A1's label so far, and saves it for now.
    const first = await uploadCarrierLabels(
      prepared.id,
      [{ cartonId: "A1", file: 0, page: 1, trackingNumber: printed(1) }],
      [1]
    )
    expect(await first.json()).toEqual({ sent: false })
    expect(await shipmentState(prepared.id)).toEqual({ status: "waiting_labels", issues: ["missing_shipping_label"] })
    expect(await database.select().from(tables.jobs)).toEqual([])
    // A2's comes in another file, and A1 keeps the label it has.
    const [a1] = await carrierLabels()
    const rest = await uploadCarrierLabels(
      prepared.id,
      [
        { cartonId: "A1", documentId: a1!.id, trackingNumber: printed(1) },
        { cartonId: "A2", file: 0, page: 2, trackingNumber: printed(2) }
      ],
      [2]
    )
    expect(await rest.json()).toEqual({ sent: true })
    expect((await carrierLabels()).toSorted((a, b) => a.name.localeCompare(b.name))).toMatchObject([
      // A1's file held only its label, so there's no page to name.
      { id: a1!.id, cartonId: "A1", trackingNumber: trackingNumber(1), sourceName: "Carrier 1.pdf", sourcePage: null },
      { cartonId: "A2", trackingNumber: trackingNumber(2), sourceName: "Carrier 1.pdf", sourcePage: 2 }
    ])
    expect(await shipmentState(prepared.id)).toEqual({ status: "ready", issues: [] })
    const emailed = await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "email"))
    expect(emailed).toMatchObject([
      {
        key: `ready:${prepared.id}:1`,
        payload: { type: "ready", to: "supplier@example.com", orderId, shipmentId: prepared.id }
      }
    ])
    const events = await database.select().from(tables.events).where(eq(tables.events.orderId, orderId))
    expect(events).toMatchObject([{ messageKey: "labelsReleased", actor: buyer.user.id }])
  })
  it("outdates the carrier label of a carton left out of a later save", async () => {
    const prepared = await preparation()
    await database
      .update(tables.shipments)
      .set({ status: "waiting_labels", packing: prepared.packing })
      .where(eq(tables.shipments.id, prepared.id))
    await uploadCarrierLabels(prepared.id, [{ cartonId: "A6", file: 0, page: 1, trackingNumber: printed(1) }], [1])
    const [label] = await carrierLabels()
    expect(await (await uploadCarrierLabels(prepared.id, [])).json()).toEqual({ sent: false })
    expect(await carrierLabels()).toEqual([])
    const [dropped] = await database.select().from(tables.documents).where(eq(tables.documents.id, label!.id))
    expect(dropped?.outdated).toBe(1)
    expect((await shipmentState(prepared.id)).issues).toContain("missing_shipping_label")
  })
  it("builds the supplier's parcel packet with each carton's tracking number", async () => {
    const prepared = await preparation()
    const snapshot = {
      ...orderData,
      items: orderData.items.map((item) => ({
        ...item,
        packingRequirements: { preparation: "sealedPolybag" as const, labels: [], countryCode: "", instructions: "" }
      }))
    }
    await database
      .update(tables.shipments)
      .set({
        packing: prepared.packing,
        snapshot,
        status: "waiting_labels",
        amazonNetwork: "awd_us",
        amazonShipmentId: "STAR-EXAMPLE",
        labels: [
          {
            cartonId: "A6",
            labelNumber: "201952611540373988",
            destinationCode: "IUSP",
            amazonShipmentId: "STAR-EXAMPLE"
          }
        ]
      })
      .where(eq(tables.shipments.id, prepared.id))
    await database.insert(tables.documents).values({
      orderId,
      shipmentId: prepared.id,
      kind: "carton_label",
      cartonId: "A6",
      objectKey: "test/parcel-label",
      name: "Label.pdf",
      bytes: 10,
      orderRevision: 1,
      shipmentRevision: 1,
      uploadedBy: "amazon"
    })
    await database.insert(tables.memberships).values({
      orgId: supplierId,
      userId: supplier.user.id,
      email: supplier.user.email,
      role: "member",
      access: { shipments: "view" }
    })
    provider.api.awdInboundShipment.mockResolvedValue({
      shipmentId: "STAR-EXAMPLE",
      destinationAddress: { ...prepared.packing.origin, name: "Amazon IUSP", countryCode: "US" }
    })
    const saved = await uploadCarrierLabels(
      prepared.id,
      [{ cartonId: "A6", file: 0, page: 1, trackingNumber: printed(1) }],
      [1]
    )
    expect(await saved.json()).toEqual({ sent: true })
    const page = await shipmentPacketPage(supplier, prepared.id)
    expect(page.data.transport).toMatchObject({ service: "parcel", carrierLabels: true })
    expect(page.data.cartons.map((carton) => [carton.id, carton.carrierLabel])).toEqual([["A6", trackingNumber(1)]])
  })
})

// A page of Amazon's AWD carton labels, with its fields in the order the labels API gives them.
async function amazonCartonLabels(fields: string[][]) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const page of fields) {
    const sheet = pdf.addPage([288, 432])
    page.forEach((text, index) => sheet.drawText(text, { x: 10, y: 400 - index * 20, size: 10, font }))
  }
  return pdf.save()
}

describe("PO to a released Amazon shipment", () => {
  it("takes a sent PO through packing, Amazon and shipping labels to the supplier's packet", async () => {
    // The buyer asks for suffocation warning labels on this line.
    const data = orderInputSchema.parse({
      ...orderData,
      items: orderData.items.map((item) => ({ ...item, suffocationWarning: true }))
    })
    await database.update(tables.orders).set({ status: "draft", data }).where(eq(tables.orders.id, orderId))
    await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
    await database.insert(tables.memberships).values({
      orgId: supplierId,
      userId: supplier.user.id,
      email: supplier.user.email,
      role: "member",
      access: { shipments: "view", prices: "view" }
    })
    const stored = new Map<string, Uint8Array>()
    storage.putFile.mockImplementation(async (key: string, bytes: Uint8Array) => {
      stored.set(key, bytes)
    })
    storage.getFile.mockImplementation(async (key: string) => stored.get(key)!)
    provider.shopifyFor.mockResolvedValue({ variants: async () => [] })

    // Sending the PO keeps its document with it and opens the first shipment.
    const { shipmentId } = await submitOrder(buyer, orderId, 1)
    const kinds = async () =>
      (await database.select().from(tables.documents).where(eq(tables.documents.outdated, 0))).map((doc) => doc.kind)
    expect(await kinds()).toEqual(["purchase_order"])

    // The supplier uploads its invoice and submits the cartons.
    context.actor = supplier
    const uploadedInvoice = await uploadPdf("invoice")
    expect(uploadedInvoice.status).toBe(200)
    const packing = packingSchema.parse({
      readyDate,
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
      cartons: [
        { cartonId: "A1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 80 }] },
        { cartonId: "A2", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 80 }] }
      ]
    })
    expect(await submitPacking(supplier, shipmentId, packing, 1)).toEqual({ approval: false })
    await prepareAmazonShipment(buyer, shipmentId, 1)

    // Amazon creates and confirms the inbound order, then makes its carton labels.
    const request = buildAwdRequest(data, packing, `copacker-${shipmentId}-1`)
    const remote = { ...request, orderId: "STAR-E2E", orderStatus: "DRAFT" }
    provider.api.create.mockResolvedValue({ orderId: remote.orderId })
    provider.api.order.mockResolvedValue(remote)
    provider.api.confirm.mockImplementation(async () => {
      provider.api.order.mockResolvedValue({
        ...remote,
        orderStatus: "CONFIRMED",
        destinationDetails: { shipmentId: "SHIP-E2E" }
      })
    })
    provider.api.labels.mockResolvedValueOnce({ labelStatus: "GENERATING" }).mockResolvedValue({
      labelStatus: "GENERATED",
      labelDownloadURL: "https://awd-labels.s3.amazonaws.com/SHIP-E2E.pdf"
    })
    const label = (sscc: string) => [
      "FNSKU#:",
      "MSKU#:",
      "QTY: 40",
      "X000000001",
      "foil-2",
      "DC: IUSP",
      "Serial Shipping Container Code (SSCC)",
      sscc
    ]
    const cartonLabels = await amazonCartonLabels([label("201952611540373988"), label("000000000000000000")])
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(Buffer.from(cartonLabels)))
    )
    // The PO email waits for the email sender, which these tests don't have.
    await database.delete(tables.jobs).where(eq(tables.jobs.kind, "email"))
    context.actor = buyer
    for (let run = 0; run < 3; run++) {
      await retryDue()
      expect(await runNextJob()).toBe(true)
    }
    const [job] = await database.select().from(tables.jobs)
    expect(job).toMatchObject({ status: "complete", error: null })
    expect(provider.api.create).toHaveBeenCalledOnce()
    expect(provider.api.confirm).toHaveBeenCalledOnce()
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(shipment).toMatchObject({ status: "waiting_labels", amazonShipmentId: "SHIP-E2E", issue: null })
    expect(shipment!.labels.map((row) => row.cartonId)).toEqual(["A1", "A2"])

    expect(
      (
        await post("shipment.transport", {
          id: shipmentId,
          revision: 1,
          expected: null,
          transport: {
            service: "parcel",
            handoff: "supplier",
            collection: "pickup",
            carrierLabels: "per_carton",
            instructions: ""
          }
        })
      ).status
    ).toBe(200)
    // The buyer books parcel transport; all that's left is its carrier labels.
    expect(await shipmentState(shipmentId)).toEqual({
      status: "waiting_labels",
      issues: ["missing_shipping_label", "missing_shipping_label"]
    })
    // They complete the packet, which goes to the supplier.
    const shipping = await uploadCarrierLabels(
      shipmentId,
      [
        { cartonId: "A1", file: 0, page: 1, trackingNumber: printed(1) },
        { cartonId: "A2", file: 0, page: 2, trackingNumber: printed(2) }
      ],
      [2]
    )
    expect(await shipping.json()).toEqual({ sent: true })
    expect(await shipmentState(shipmentId)).toEqual({ status: "ready", issues: [] })

    // Every document is kept with the PO, and the supplier can download the labels once they're released.
    expect((await kinds()).toSorted()).toEqual(
      ["carton_label", "carton_label", "invoice", "purchase_order", "shipping_label", "shipping_label"].toSorted()
    )
    context.actor = supplier
    const released = await orderWorkflow(supplier, orderId)
    expect(released.shipments[0]).toMatchObject({ status: "ready", packetUrl: `/shipments/${shipmentId}/packet` })
    expect(released.documents.every((doc) => doc.downloadUrl)).toBe(true)
    const packet = await downloadPacket(new Request("http://localhost?section=carton_labels"), {
      params: { id: shipmentId }
    })
    expect(packet.status).toBe(200)
    const pages = (await PDFDocument.load(await packet.arrayBuffer())).getPages()
    // Packing list and checklist, the product labels, the suffocation warning labels, two carton labels and two
    // shipping labels.
    expect(pages.map((page) => [page.getWidth(), page.getHeight()])).toEqual(
      Array.from({ length: 2 }, () => [288, 432])
    )
    // The PO's labels download has the product's sheet, then the warning sheet.
    const labels = await downloadOrderLabels(new Request("http://localhost"), {
      params: { id: orderId }
    })
    expect(labels.status).toBe(200)
    const sheets = await PDFDocument.load(await labels.arrayBuffer())
    expect(sheets.getPageCount()).toBe(2)
  })
})

describe("PO to the buyer's own location", () => {
  const deliveryId = randomUUID()
  // The PO from the other tests, to the buyer's own warehouse instead: without an FNSKU its label prints the SKU, and
  // the line asks for suffocation warning labels.
  const data = orderInputSchema.parse({
    ...orderData,
    deliveryId,
    items: warehouseLines(orderData.items).map((item) => ({ ...item, asin: "", fnsku: "", suffocationWarning: true }))
  })
  const stored = new Map<string, Uint8Array>()
  const packet = (id: string) =>
    downloadPacket(new Request("http://localhost?section=product_labels"), { params: { id } })
  const pageSizes = async (response: Response) =>
    (await PDFDocument.load(await response.arrayBuffer())).getPages().map((page) => [page.getWidth(), page.getHeight()])
  const letter = [612, 792]
  beforeEach(async () => {
    await database.insert(tables.contacts).values({
      id: deliveryId,
      orgId: buyerId,
      name: "Seattle warehouse",
      kind: "delivery",
      address: addressSchema.parse({
        name: "Receiving",
        addressLine1: "1 Harbor Way",
        city: "Seattle",
        stateOrRegion: "WA",
        postalCode: "98101",
        countryCode: "US"
      })
    })
    await database.update(tables.orders).set({ status: "draft", data }).where(eq(tables.orders.id, orderId))
    await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
    await database.insert(tables.memberships).values({
      orgId: supplierId,
      userId: supplier.user.id,
      email: supplier.user.email,
      role: "member",
      access: { shipments: "view", prices: "view" }
    })
    stored.clear()
    storage.putFile.mockImplementation(async (key: string, bytes: Uint8Array) => {
      stored.set(key, bytes)
    })
    storage.getFile.mockImplementation(async (key: string) => stored.get(key)!)
    // Shopify has no country of origin for the product's label.
    provider.shopifyFor.mockResolvedValue({ variants: async () => [] })
  })
  // The buyer sends the PO, and the supplier packs it in two cartons with its invoice.
  async function packed() {
    const { shipmentId } = await submitOrder(buyer, orderId, 1)
    context.actor = supplier
    await uploadPdf("invoice")
    const packing = packingSchema.parse({
      readyDate,
      origin: {
        name: "Supplier",
        addressLine1: "Road 1",
        city: "Shenzhen",
        stateOrRegion: "Guangdong",
        postalCode: "518000",
        countryCode: "CN",
        phoneNumber: "+86123456789"
      },
      cartons: ["A1", "A2"].map((cartonId) => ({
        cartonId,
        length: 50,
        width: 40,
        height: 30,
        weight: 15,
        items: [{ itemId, pieces: 80 }]
      }))
    })
    expect(await submitPacking(supplier, shipmentId, packing, 1)).toEqual({ approval: false })
    return shipmentId
  }

  it("releases the packet with the packing list, checklist and labels as soon as the supplier packs", async () => {
    const shipmentId = await packed()
    expect((await orderWorkflow(supplier, orderId)).shipments[0]).toMatchObject({
      status: "ready",
      issues: [],
      packetUrl: `/shipments/${shipmentId}/packet`
    })
    expect(await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "amazon"))).toEqual([])
    const downloaded = await packet(shipmentId)
    expect(downloaded.status).toBe(200)
    // The packing list and checklist made for the warehouse, the product's labels and the suffocation warning labels.
    // There are no carton or shipping labels.
    expect(await pageSizes(downloaded)).toEqual([letter, letter])
    // Nothing kept in storage goes in: its packing documents and labels are made now.
    expect(storage.getFile).not.toHaveBeenCalled()
  })

  it("holds the packet back until the buyer adds a product label it needs", async () => {
    // The product takes the buyer's own label, which hasn't been uploaded.
    const productId = "gid://shopify/Product/1"
    const { variantId, inventoryItemId } = data.items[0]!
    await database.insert(tables.stockSnapshots).values({
      orgId: buyerId,
      source: "shopify",
      externalAccountId: "test.myshopify.com",
      scopeKey: "store",
      data: {
        source: "shopify",
        scopeKey: "store",
        shopifyDomain: "test.myshopify.com",
        startedAt: "2026-09-27T00:00:00.000Z",
        observedAt: "2026-09-27T00:00:00.000Z",
        rows: [
          {
            variantId,
            inventoryItemId,
            buyerSku: "foil-2",
            productId,
            productTitle: "Foil",
            variantTitle: "Default Title",
            imageUrl: null,
            tracked: true,
            unit: "shopify_inventory_unit",
            levels: []
          }
        ]
      }
    })
    await database
      .insert(tables.productDefaults)
      .values({ orgId: buyerId, shopifyDomain: "test.myshopify.com", productId, productLabel: "uploaded" })
    const shipmentId = await packed()
    expect((await orderWorkflow(supplier, orderId)).shipments[0]).toMatchObject({
      status: "ready",
      issues: [
        { code: "missing_product_label", itemId, message: "Add a product label for foil-2 on the Products page" }
      ],
      packetUrl: null
    })
    const held = await packet(shipmentId)
    expect(held.status).toBe(409)
    expect(await held.text()).toContain("incomplete")
    expect(storage.getFile).not.toHaveBeenCalled()

    // The buyer uploads the label on the Products page, and the packet carries it.
    const label = await PDFDocument.create()
    label.addPage([288, 432])
    stored.set("barcodes/foil-2.pdf", await label.save())
    await database.insert(tables.productBarcodes).values({
      orgId: buyerId,
      shopifyDomain: "test.myshopify.com",
      variantId,
      productId,
      objectKey: "barcodes/foil-2.pdf",
      name: "foil-2.pdf",
      bytes: 100,
      uploadedBy: buyer.user.id
    })
    expect((await orderWorkflow(supplier, orderId)).shipments[0]).toMatchObject({
      issues: [],
      packetUrl: `/shipments/${shipmentId}/packet`
    })
    const downloaded = await packet(shipmentId)
    expect(downloaded.status).toBe(200)
    expect(await pageSizes(downloaded)).toEqual([[288, 432], letter])
  })
})

const gloveId = randomUUID()
// A PO to FBA: the two-pack cords from the other tests, and single gloves.
const fbaOrder = orderInputSchema.parse({
  ...orderData,
  items: [
    { ...orderData.items[0], receiver: "fba" },
    {
      receiver: "fba",
      id: gloveId,
      variantId: "gid://shopify/ProductVariant/2",
      inventoryItemId: "gid://shopify/InventoryItem/2",
      name: "Glove",
      variant: "6",
      buyerSku: "glove-6",
      supplierSku: "G-6",
      asin: "B000000002",
      fnsku: "X000000002",
      pieces: 10,
      piecesPerSet: 1,
      unitPrice: 900,
      prepCategory: "NO_PREP"
    }
  ]
})
const fbaPlanId = "wf00000000-0000-4000-8000-000000000001"

// Amazon's FBA inbound plans, as far as the shipment job uses them. Every step finishes by the time the job checks its
// operation. Amazon offers a packing option that splits cords from gloves and one that doesn't, and places the plan's
// boxes in two shipments to two warehouses, each offering its partnered carrier and the seller's own carrier with a
// delivery window.
function fakeFba() {
  const state = {
    name: "",
    status: "ACTIVE",
    packingOptions: [] as Array<{ packingOptionId: string; status: string; packingGroups: string[] }>,
    boxes: [] as Array<{ items: Array<{ msku: string; quantity: number }>; dimensions: unknown; weight: unknown }>,
    placementOptions: [] as Array<{ placementOptionId: string; status: string; shipmentIds: string[]; fee: number }>,
    transportation: false,
    windows: new Set<string>(),
    chosenWindows: new Map<string, string>(),
    selected: new Map<string, string>(),
    operations: 0
  }
  const api = provider.api
  const started = async () => `op-${++state.operations}`
  const groupItems: Record<string, string[]> = { cords: ["foil-2"], gloves: ["glove-6"], all: ["foil-2", "glove-6"] }
  // Cords go to the first warehouse, gloves to the second.
  const shipmentFor = (msku: string) => (msku === "foil-2" ? "sh-1" : "sh-2")
  api.fbaCreatePlan.mockImplementation(async (body: { name: string }) => {
    state.name = body.name
    return { inboundPlanId: fbaPlanId, operationId: await started() }
  })
  api.fbaOperation.mockResolvedValue({ operationStatus: "SUCCESS", operationProblems: [] })
  api.fbaPlan.mockImplementation(async () => ({
    inboundPlanId: fbaPlanId,
    name: state.name,
    status: state.status,
    packingOptions: state.packingOptions.map(({ packingOptionId, status }) => ({ packingOptionId, status })),
    placementOptions: state.placementOptions.map(({ placementOptionId, status }) => ({ placementOptionId, status }))
  }))
  api.fbaGeneratePackingOptions.mockImplementation(async () => {
    state.packingOptions = [
      { packingOptionId: "po-split", status: "OFFERED", packingGroups: ["cords", "gloves"] },
      { packingOptionId: "po-together", status: "OFFERED", packingGroups: ["all"] }
    ]
    return started()
  })
  api.fbaPackingOptions.mockImplementation(async () =>
    state.packingOptions.map((option) => ({ ...option, fees: [], discounts: [] }))
  )
  api.fbaPackingGroupItems.mockImplementation(async (_plan: string, group: string) =>
    groupItems[group]!.map((msku) => ({ msku, quantity: 1 }))
  )
  api.fbaConfirmPackingOption.mockImplementation(async (_plan: string, id: string) => {
    state.packingOptions = state.packingOptions.map((option) => ({
      ...option,
      status: option.packingOptionId === id ? "ACCEPTED" : "EXPIRED"
    }))
    return started()
  })
  api.fbaSetPacking.mockImplementation(
    async (_plan: string, body: { packageGroupings: Array<{ boxes: (typeof state.boxes)[number][] }> }) => {
      state.boxes = body.packageGroupings.flatMap((group) => group.boxes)
      return started()
    }
  )
  api.fbaPlanBoxes.mockImplementation(async () => state.boxes.map((_, index) => ({ packageId: `pkg-${index}` })))
  api.fbaGeneratePlacementOptions.mockImplementation(async () => {
    state.placementOptions = [
      { placementOptionId: "pl-one", status: "OFFERED", shipmentIds: ["sh-1"], fee: 5000 },
      { placementOptionId: "pl-split", status: "OFFERED", shipmentIds: ["sh-1", "sh-2"], fee: 0 }
    ]
    return started()
  })
  api.fbaPlacementOptions.mockImplementation(async () =>
    state.placementOptions.map(({ fee, ...option }) => ({
      ...option,
      fees: [{ type: "FEE", value: { amount: fee, code: "USD" } }],
      discounts: []
    }))
  )
  api.fbaConfirmPlacementOption.mockImplementation(async (_plan: string, id: string) => {
    state.placementOptions = state.placementOptions.map((option) => ({
      ...option,
      status: option.placementOptionId === id ? "ACCEPTED" : "EXPIRED"
    }))
    return started()
  })
  api.fbaShipment.mockImplementation(async (_plan: string, shipmentId: string) => ({
    shipmentId,
    placementOptionId: "pl-split",
    destination: { destinationType: "AMAZON_OPTIMIZED", warehouseId: shipmentId === "sh-1" ? "SMF3" : "ONT8" },
    selectedTransportationOptionId: state.selected.get(shipmentId),
    selectedDeliveryWindow: state.chosenWindows.has(shipmentId)
      ? { deliveryWindowOptionId: state.chosenWindows.get(shipmentId) }
      : undefined,
    shipmentConfirmationId: state.selected.has(shipmentId)
      ? `FBA15${shipmentId.toUpperCase().replace("-", "")}`
      : undefined
  }))
  api.fbaGenerateTransportationOptions.mockImplementation(async () => {
    state.transportation = true
    return started()
  })
  api.fbaTransportationOptions.mockImplementation(async (_plan: string, _placement: string, shipmentId: string) =>
    state.transportation
      ? [
          {
            transportationOptionId: `${shipmentId}-partnered`,
            shipmentId,
            shippingMode: "GROUND_SMALL_PARCEL",
            shippingSolution: "AMAZON_PARTNERED_CARRIER",
            preconditions: [],
            carrier: { name: "UPS" }
          },
          {
            transportationOptionId: `${shipmentId}-own`,
            shipmentId,
            shippingMode: "GROUND_SMALL_PARCEL",
            shippingSolution: "USE_YOUR_OWN_CARRIER",
            preconditions: ["CONFIRMED_DELIVERY_WINDOW"],
            carrier: { name: "Other" }
          }
        ]
      : []
  )
  api.fbaGenerateDeliveryWindowOptions.mockImplementation(async (_plan: string, shipmentId: string) => {
    state.windows.add(shipmentId)
    return started()
  })
  api.fbaDeliveryWindowOptions.mockImplementation(async (_plan: string, shipmentId: string) =>
    state.windows.has(shipmentId)
      ? [
          {
            deliveryWindowOptionId: `${shipmentId}-window`,
            startDate: "2099-01-01T00:00:00Z",
            endDate: "2099-01-08T00:00:00Z",
            availabilityType: "AVAILABLE",
            validUntil: "2099-01-01T00:00:00Z"
          }
        ]
      : []
  )
  api.fbaConfirmDeliveryWindow.mockImplementation(async (_plan: string, shipmentId: string, id: string) => {
    state.chosenWindows.set(shipmentId, id)
    return started()
  })
  api.fbaConfirmTransportation.mockImplementation(
    async (_plan: string, selections: Array<{ shipmentId: string; transportationOptionId: string }>) => {
      for (const selection of selections) {
        if (!state.chosenWindows.has(selection.shipmentId)) {
          throw new Error("Confirm a delivery window first")
        }
        state.selected.set(selection.shipmentId, selection.transportationOptionId)
      }
      return started()
    }
  )
  api.fbaShipmentBoxes.mockImplementation(async (_plan: string, shipmentId: string) =>
    state.boxes.flatMap((box, index) =>
      shipmentFor(box.items[0]!.msku) === shipmentId
        ? [
            {
              packageId: `pkg-${index}`,
              boxId: `FBA15${shipmentId.toUpperCase().replace("-", "")}U00000${index + 1}`,
              items: box.items,
              dimensions: box.dimensions,
              weight: box.weight
            }
          ]
        : []
    )
  )
  api.fbaBoxLabel.mockImplementation(
    async (_confirmation: string, boxId: string) => `https://fba-labels.s3.amazonaws.com/${boxId}.pdf`
  )
  api.fbaCancelPlan.mockImplementation(async () => {
    state.status = "VOIDED"
    return started()
  })
  return state
}

// The forwarder joining Copacker: the test user makes a forwarder workspace, with any addresses it already keeps, and
// accepts the forwarder's invitation into it.
async function joinForwarder(forwarderId: string, kept: Array<{ name: string; address: Address }> = []) {
  const forwarderOrg = randomUUID()
  await database.insert(tables.organizations).values({ id: forwarderOrg, name: "Yiwu Logistics", kind: "forwarder" })
  await database
    .insert(tables.memberships)
    .values({ orgId: forwarderOrg, userId: buyer.user.id, email: buyer.user.email, role: "owner" })
  if (kept.length) {
    await database
      .insert(tables.contacts)
      .values(kept.map((contact) => ({ ...contact, orgId: forwarderOrg, kind: "delivery" as const })))
  }
  await database
    .update(tables.forwarders)
    .set({
      email: buyer.user.email,
      invitationHash: hash("forwarder-invitation-test-token"),
      expiresAt: new Date(Date.now() + 86400000)
    })
    .where(eq(tables.forwarders.id, forwarderId))
  await acceptForwarderInvitation(buyer.user, forwarderOrg, "forwarder-invitation-test-token")
  return forwarderOrg
}

describe("PO to a released FBA shipment", () => {
  beforeEach(async () => {
    await database.update(tables.orders).set({ status: "draft", data: fbaOrder }).where(eq(tables.orders.id, orderId))
    await database
      .update(tables.orderRevisions)
      .set({ data: fbaOrder })
      .where(eq(tables.orderRevisions.orderId, orderId))
    const stored = new Map<string, Uint8Array>()
    storage.putFile.mockImplementation(async (key: string, bytes: Uint8Array) => {
      stored.set(key, bytes)
    })
    storage.getFile.mockImplementation(async (key: string) => stored.get(key)!)
    provider.shopifyFor.mockResolvedValue({ variants: async () => [] })
    const label = await PDFDocument.create()
    label.addPage([612, 792])
    const bytes = await label.save()
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(Buffer.from(bytes)))
    )
  })

  // Sends the PO, enters the invoice and cartons for the supplier and runs the Amazon job until it stops.
  async function packed(cartons: Packing["cartons"]) {
    const { shipmentId } = await submitOrder(buyer, orderId, 1)
    await uploadPdf("invoice")
    const packing = packingSchema.parse({
      readyDate,
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
      cartons
    })
    expect(await submitPacking(buyer, shipmentId, packing, 1)).toEqual({ approval: false })
    await prepareAmazonShipment(buyer, shipmentId, 1)
    await database.delete(tables.jobs).where(eq(tables.jobs.kind, "email"))
    for (let run = 0; run < 30; run++) {
      await retryDue()
      if (!(await runNextJob())) {
        break
      }
    }
    return shipmentId
  }

  it("plans, packs, places, books the buyer's own carrier and fetches each carton's box label", async () => {
    const amazon = fakeFba()
    const shipmentId = await packed([
      { cartonId: "C1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 80 }] },
      // Mixed cartons are fine at FBA, and a 70 cm carton holding a single unit is too.
      { cartonId: "C2", length: 50, width: 40, height: 30, weight: 12, items: [{ itemId, pieces: 80 }] },
      { cartonId: "G1", length: 70, width: 20, height: 10, weight: 1, items: [{ itemId: gloveId, pieces: 1 }] },
      { cartonId: "G2", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 9 }] }
    ])
    const [job] = await database.select().from(tables.jobs)
    expect(job).toMatchObject({ status: "complete", error: null })
    expect(provider.api.fbaCreatePlan).toHaveBeenCalledOnce()
    expect(provider.api.fbaCreatePlan.mock.calls[0]![0]).toMatchObject({
      name: `cp-${shipmentId.replaceAll("-", "")}-1`,
      destinationMarketplaces: ["ATVPDKIKX0DER"],
      sourceAddress: { stateOrProvinceCode: "Guangdong", countryCode: "CN" },
      items: [
        { msku: "foil-2", quantity: 80, labelOwner: "SELLER", prepOwner: "NONE" },
        { msku: "glove-6", quantity: 10, labelOwner: "SELLER", prepOwner: "SELLER" }
      ]
    })
    // The option with one packing group, the cheaper placement across two warehouses, and the buyer's own carrier.
    expect(provider.api.fbaConfirmPackingOption).toHaveBeenCalledWith(fbaPlanId, "po-together")
    expect(amazon.boxes.map((box) => box.items)).toEqual([
      [{ msku: "foil-2", quantity: 40, labelOwner: "SELLER", prepOwner: "NONE" }],
      [{ msku: "foil-2", quantity: 40, labelOwner: "SELLER", prepOwner: "NONE" }],
      [{ msku: "glove-6", quantity: 1, labelOwner: "SELLER", prepOwner: "SELLER" }],
      [{ msku: "glove-6", quantity: 9, labelOwner: "SELLER", prepOwner: "SELLER" }]
    ])
    expect(provider.api.fbaConfirmPlacementOption).toHaveBeenCalledWith(fbaPlanId, "pl-split")
    expect([...amazon.selected.values()]).toEqual(["sh-1-own", "sh-2-own"])
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(shipment).toMatchObject({
      status: "waiting_labels",
      amazonOrderId: fbaPlanId,
      amazonShipmentId: "FBA15SH1, FBA15SH2",
      // Each SKU's group in the confirmed option.
      packingGroups: { "foil-2": "all", "glove-6": "all" },
      issue: null
    })
    expect(shipment!.labels).toEqual([
      { cartonId: "C1", labelNumber: "FBA15SH1U000001", destinationCode: "SMF3", amazonShipmentId: "FBA15SH1" },
      { cartonId: "C2", labelNumber: "FBA15SH1U000002", destinationCode: "SMF3", amazonShipmentId: "FBA15SH1" },
      { cartonId: "G1", labelNumber: "FBA15SH2U000003", destinationCode: "ONT8", amazonShipmentId: "FBA15SH2" },
      { cartonId: "G2", labelNumber: "FBA15SH2U000004", destinationCode: "ONT8", amazonShipmentId: "FBA15SH2" }
    ])
    expect(provider.api.fbaBoxLabel).toHaveBeenCalledWith("FBA15SH2", "FBA15SH2U000004")

    expect(
      (
        await post("shipment.transport", {
          id: shipmentId,
          revision: 1,
          expected: null,
          transport: {
            service: "parcel",
            handoff: "supplier",
            collection: "pickup",
            carrierLabels: "per_carton",
            instructions: ""
          }
        })
      ).status
    ).toBe(200)
    // Parcel transport needs a carrier label on each carton, and the four complete the packet.
    expect(await shipmentState(shipmentId)).toEqual({
      status: "waiting_labels",
      issues: Array(4).fill("missing_shipping_label")
    })
    const shipping = await uploadCarrierLabels(
      shipmentId,
      ["C1", "C2", "G1", "G2"].map((cartonId, index) => ({
        cartonId,
        file: 0,
        page: index + 1,
        trackingNumber: printed(index + 1)
      })),
      [4]
    )
    expect(await shipping.json()).toEqual({ sent: true })
    await database
      .insert(tables.memberships)
      .values({ orgId: buyerId, userId: buyer.user.id, email: buyer.user.email, role: "owner" })
    const packet = await downloadPacket(new Request("http://localhost?section=carton_labels"), {
      params: { id: shipmentId }
    })
    expect(packet.status).toBe(200)
    // Packing list, checklist, two product label sheets, four box labels and four shipping labels.
    expect((await PDFDocument.load(await packet.arrayBuffer())).getPageCount()).toBe(4)
  })

  it("ships to Amazon from the forwarder's address when the PO stops at a forwarder on the way", async () => {
    fakeFba()
    const forwarder = await createForwarder({ id: buyerId, name: "Buyer" }, { name: "Yiwu Logistics", email: "" })
    const stop = {
      name: "Yiwu warehouse",
      addressLine1: "88 Futian Road",
      addressLine2: "",
      city: "Yiwu",
      stateOrRegion: "Zhejiang",
      postalCode: "322000",
      countryCode: "CN",
      phoneNumber: "",
      email: ""
    }
    await saveForwarderAddress(buyerId, { forwarderId: forwarder.id, name: "Yiwu warehouse", address: stop })
    const [saved] = await forwarderAddresses(buyerId)
    const data = { ...fbaOrder, via: { forwarderId: forwarder.id, addressId: saved!.addressId } }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
    const cartons = [
      { cartonId: "C1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 160 }] },
      { cartonId: "G1", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
    ]
    // Amazon needs a phone number to collect from the forwarder.
    const shipmentId = await packed(cartons)
    const [waiting] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(waiting).toMatchObject({ status: "needs_attention", amazonOrderId: null, operation: "none" })
    expect(waiting!.issue).toContain("Add a phone number to Yiwu Logistics’s Yiwu warehouse address")
    await saveForwarderAddress(buyerId, {
      forwarderId: forwarder.id,
      id: saved!.addressId,
      name: "Yiwu warehouse",
      address: { ...stop, phoneNumber: "+8657985550100" }
    })
    const retried = await action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: "shipment.retry", data: { id: shipmentId, revision: 1 } })
      })
    )
    expect(retried.status).toBe(200)
    for (let run = 0; run < 30 && (await runNextJob()); run++) {
      await retryDue()
    }
    expect(provider.api.fbaCreatePlan.mock.calls[0]![0]).toMatchObject({
      sourceAddress: {
        name: "Yiwu warehouse",
        addressLine1: "88 Futian Road",
        city: "Yiwu",
        stateOrProvinceCode: "Zhejiang",
        phoneNumber: "+8657985550100"
      }
    })
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(shipment?.status).toBe("waiting_labels")
    // The supplier's own documents still show its pickup address.
    expect(shipment!.packing!.origin.city).toBe("Shenzhen")
  })

  it("keeps a sent PO's stop when its forwarder joins, at the forwarder's own copy of the address", async () => {
    fakeFba()
    const forwarder = await createForwarder({ id: buyerId, name: "Buyer" }, { name: "Yiwu Logistics", email: "" })
    const stop = {
      name: "Yiwu warehouse",
      addressLine1: "88 Futian Road",
      addressLine2: "",
      city: "Yiwu",
      stateOrRegion: "Zhejiang",
      postalCode: "322000",
      countryCode: "CN",
      phoneNumber: "",
      email: ""
    }
    await saveForwarderAddress(buyerId, { forwarderId: forwarder.id, name: "Yiwu warehouse", address: stop })
    const [saved] = await forwarderAddresses(buyerId)
    const data = { ...fbaOrder, via: { forwarderId: forwarder.id, addressId: saved!.addressId } }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
    // Amazon waits for a phone number at the stop, and the forwarder joins before anyone adds one.
    const shipmentId = await packed([
      { cartonId: "C1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 160 }] },
      { cartonId: "G1", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
    ])
    const forwarderOrg = await joinForwarder(forwarder.id)
    const [own] = await database.select().from(tables.contacts).where(eq(tables.contacts.orgId, forwarderOrg))
    // The forwarder adds the phone number to the address it now keeps, and the buyer retries.
    context.actor = actor("forwarder", forwarderOrg)
    const update = {
      id: own!.id,
      name: "Yiwu warehouse",
      kind: "delivery",
      address: { ...stop, phoneNumber: "+8657985550100" }
    }
    expect((await post("contact.update", update)).status).toBe(200)
    context.actor = buyer
    expect((await post("shipment.retry", { id: shipmentId, revision: 1 })).status).toBe(200)
    for (let run = 0; run < 30 && (await runNextJob()); run++) {
      await retryDue()
    }
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(shipment).toMatchObject({ status: "waiting_labels", issue: null })
    expect(provider.api.fbaCreatePlan.mock.calls[0]![0]).toMatchObject({
      sourceAddress: { addressLine1: "88 Futian Road", city: "Yiwu", phoneNumber: "+8657985550100" }
    })
    // The purchase order ships to the address as the forwarder keeps it.
    await generatePo(orderId)
    expect(vi.mocked(purchaseOrderPdf).mock.lastCall![0].shipTo).toEqual({
      name: "Yiwu Logistics, Yiwu warehouse",
      lines: ["Then to Amazon FBA", "88 Futian Road", "Yiwu, Zhejiang 322000", "CN", "Yiwu warehouse, +8657985550100"]
    })
  })

  it("splits one PO's cartons into a shipment per Amazon network, each with its own Amazon job", async () => {
    fakeFba()
    // Cords go to AWD US in bulk; gloves go to FBA.
    const data = {
      ...fbaOrder,
      items: [{ ...fbaOrder.items[0]!, receiver: "awd_us" as const }, fbaOrder.items[1]!]
    }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
    // An already-saved draft from before drafts were assigned a network at PO submission.
    await database.update(tables.orders).set({ status: "submitted" }).where(eq(tables.orders.id, orderId))
    const [draft] = await database
      .insert(tables.shipments)
      .values({ orderId, orderRevision: 1, snapshot: data })
      .returning()
    const shipmentId = draft!.id
    await uploadPdf("invoice")
    const packing = packingSchema.parse({
      readyDate,
      origin: {
        name: "Supplier",
        addressLine1: "Road 1",
        city: "Shenzhen",
        stateOrRegion: "Guangdong",
        postalCode: "518000",
        countryCode: "CN",
        phoneNumber: "+86123456789"
      },
      cartons: [
        { cartonId: "A1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 80 }] },
        { cartonId: "A2", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 80 }] },
        { cartonId: "G1", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
      ]
    })
    // A carton can't mix networks.
    const mixed = {
      ...packing,
      cartons: [
        {
          ...packing.cartons[0]!,
          items: [
            { itemId, pieces: 160 },
            { itemId: gloveId, pieces: 10 }
          ]
        }
      ]
    }
    await expect(submitPacking(buyer, shipmentId, mixed, 1)).rejects.toThrow(
      "Pack FBA and AWD US products in separate cartons"
    )
    await submitPacking(buyer, shipmentId, packing, 1)
    await prepareAmazonShipment(buyer, shipmentId, 1)
    const rows = await database.select().from(tables.shipments).where(eq(tables.shipments.orderId, orderId))
    expect(
      rows
        .map((row) => [row.amazonNetwork, row.status, row.packing!.cartons.map((carton) => carton.cartonId)])
        .toSorted()
    ).toEqual([
      ["awd_us", "queued", ["A1", "A2"]],
      ["fba", "queued", ["G1"]]
    ])
    expect(rows.find((row) => row.id === shipmentId)?.amazonNetwork).toBe("fba")
    const queued = await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "amazon"))
    expect(queued.map((job) => job.payload.shipmentId).toSorted()).toEqual(rows.map((row) => row.id).toSorted())
    const events = await database.select().from(tables.events).where(eq(tables.events.orderId, orderId))
    expect(events).toContainEqual(
      expect.objectContaining({
        messageKey: "packingSplit",
        messageValues: { networks: ["FBA", "AWD US"] },
        message: null
      })
    )
    // Every piece is reserved once across the two shipments.
    expect((await orderWorkflow(buyer, orderId)).items.map((item) => item.remainingPieces)).toEqual([0, 0])
    // The FBA shipment goes through Amazon's inbound plan on its own.
    await database.delete(tables.jobs).where(eq(tables.jobs.kind, "email"))
    await database
      .delete(tables.jobs)
      .where(eq(tables.jobs.key, `amazon:${rows.find((row) => row.amazonNetwork === "awd_us")!.id}:1`))
    for (let run = 0; run < 30 && (await runNextJob()); run++) {
      await retryDue()
    }
    expect(provider.api.fbaCreatePlan.mock.calls[0]![0]).toMatchObject({ items: [{ msku: "glove-6", quantity: 10 }] })
    const [fba] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(fba).toMatchObject({ status: "waiting_labels", amazonShipmentId: "FBA15SH2" })
  })

  it("keeps one PO invoice when shipments split or are corrected", async () => {
    const data = {
      ...fbaOrder,
      items: [{ ...fbaOrder.items[0]!, receiver: "awd_us" as const }, fbaOrder.items[1]!]
    }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
    // An already-saved draft from before drafts were assigned a network at PO submission.
    await database.update(tables.orders).set({ status: "submitted" }).where(eq(tables.orders.id, orderId))
    const [draft] = await database
      .insert(tables.shipments)
      .values({ orderId, orderRevision: 1, snapshot: data })
      .returning()
    const shipmentId = draft!.id
    await uploadPdf("invoice")
    const packing = packingSchema.parse({
      readyDate,
      origin: {
        name: "Supplier",
        addressLine1: "Road 1",
        city: "Shenzhen",
        stateOrRegion: "Guangdong",
        postalCode: "518000",
        countryCode: "CN",
        phoneNumber: "+86123456789"
      },
      cartons: [
        { cartonId: "A1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 160 }] },
        { cartonId: "G1", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
      ]
    })
    await submitPacking(buyer, shipmentId, packing, 1)
    await prepareAmazonShipment(buyer, shipmentId, 1)
    const [awd] = await database
      .select()
      .from(tables.shipments)
      .where(and(eq(tables.shipments.orderId, orderId), eq(tables.shipments.amazonNetwork, "awd_us")))
    // The FBA shipment's cartons are corrected while the AWD shipment carries on and is released.
    await correctShipment(buyer, shipmentId, "Change cartons")
    await database.update(tables.shipments).set({ status: "ready" }).where(eq(tables.shipments.id, awd!.id))
    context.actor = supplier
    expect(await (await post("shipment.ship", { id: awd!.id })).json()).toEqual({ ok: true })
    const invoices = await database.select().from(tables.documents).where(eq(tables.documents.kind, "invoice"))
    expect(invoices).toMatchObject([{ shipmentId: null, name: "Labels.pdf", outdated: 0 }])
    expect(invoices).toHaveLength(1)
    const invoice = invoices[0]!
    await database
      .insert(tables.memberships)
      .values({ orgId: supplierId, userId: supplier.user.id, email: supplier.user.email, role: "owner" })
    const download = await downloadDocument(new Request("http://localhost"), {
      params: { id: invoice.id }
    })
    expect(download.status).toBe(200)
    expect((await PDFDocument.load(await download.arrayBuffer())).getPageCount()).toBe(1)
  })

  it("keeps products Amazon packs separately out of the same carton", async () => {
    fakeFba()
    provider.api.fbaGeneratePackingOptions.mockImplementation(async () => "op-split-only")
    provider.api.fbaPackingOptions.mockResolvedValue([
      { packingOptionId: "po-split", status: "OFFERED", packingGroups: ["cords", "gloves"], fees: [], discounts: [] }
    ])
    const shipmentId = await packed([
      {
        cartonId: "M1",
        length: 50,
        width: 40,
        height: 30,
        weight: 15,
        items: [
          { itemId, pieces: 160 },
          { itemId: gloveId, pieces: 10 }
        ]
      }
    ])
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(shipment).toMatchObject({
      status: "needs_attention",
      amazonOrderId: fbaPlanId,
      packingGroups: { "foil-2": "cords", "glove-6": "gloves" }
    })
    expect(shipment!.issue).toContain("Pack each product in its own cartons")

    // Packed again after cancelling the plan, the same carton breaks the groups Amazon set before it's sent.
    await correctShipment(buyer, shipmentId, "Pack cords and gloves apart")
    const cancelled = await action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: "shipment.cancelAmazon", data: { id: shipmentId } })
      })
    )
    expect(cancelled.status).toBe(200)
    const next = await newShipment(supplier, orderId)
    const message =
      "FBA can’t take B-2 and G-6 in one carton: Amazon handles them differently, for example for dangerous goods, prep or labels"
    expect((await checkPacking(supplier, next.id, shipment!.packing)).issues).toContainEqual(
      expect.objectContaining({ code: "packing_rule", cartonId: "M1", message })
    )
    const apart = {
      ...shipment!.packing!,
      cartons: [
        { cartonId: "M1", length: 50, width: 40, height: 30, weight: 12, items: [{ itemId, pieces: 160 }] },
        { cartonId: "M2", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
      ]
    }
    expect((await checkPacking(supplier, next.id, apart)).issues).toEqual([])
  })

  it("cancels the inbound plan in Amazon before a replacement shipment", async () => {
    const amazon = fakeFba()
    const shipmentId = await packed([
      { cartonId: "C1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 160 }] },
      { cartonId: "G1", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
    ])
    await correctShipment(buyer, shipmentId, "Change cartons")
    const cancel = () =>
      action(
        new Request("http://localhost:3000/api/action", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ action: "shipment.cancelAmazon", data: { id: shipmentId } })
        })
      )
    expect((await cancel()).status).toBe(200)
    expect(amazon.status).toBe("VOIDED")
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(shipment?.status).toBe("cancelled")
  })
})

describe("fluid packing handoff", () => {
  it("resolves the request language before holding a purchase order transaction", async () => {
    await database.update(tables.orders).set({ status: "draft" })
    const transaction = vi.spyOn(database, "transaction")
    const resolve = vi.fn<() => ReturnType<typeof resolveLocalization>>(async () => {
      // The profile lookup cannot borrow a second connection while the domain transaction holds the first one.
      expect(transaction).not.toHaveBeenCalled()
      return resolveLocalization({ acceptLanguage: "en" })
    })
    try {
      const response = await withLocalization(resolve, () => post("order.submit", { id: orderId, revision: 1 }))
      expect(response.status).toBe(200)
      expect(resolve).toHaveBeenCalledOnce()
      expect(transaction).toHaveBeenCalled()
      expect((await database.select().from(tables.orders))[0]?.status).toBe("submitted")
    } finally {
      transaction.mockRestore()
    }
  })
  it("starts independent AWD and FBA drafts and prevents packing a product into the wrong network", async () => {
    const fbaItem = { ...orderData.items[0]!, id: randomUUID(), buyerSku: "foil-fba", receiver: "fba" as const }
    const data = { ...orderData, items: [...orderData.items, fbaItem] }
    await database.update(tables.orders).set({ status: "draft", data })
    await submitOrder(buyer, orderId, 1)
    const drafts = await database.select().from(tables.shipments).where(eq(tables.shipments.orderId, orderId))
    expect(drafts.map((row) => row.amazonNetwork).sort()).toEqual(["awd_us", "fba"])
    const awd = drafts.find((row) => row.amazonNetwork === "awd_us")!
    const prepared = await preparation()
    const wrong = {
      ...prepared.packing,
      cartons: prepared.packing.cartons.map((carton) => ({ ...carton, items: [{ itemId: fbaItem.id, pieces: 160 }] }))
    }
    await expect(submitPacking(supplier, awd.id, wrong, 1)).rejects.toThrow(
      "Pack only products assigned to this shipment"
    )
    expect(provider.api.create).not.toHaveBeenCalled()
  })
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
  it("emails the PO only to a supplier that has joined", async () => {
    await database.update(tables.orders).set({ status: "draft" })
    await submitOrder(buyer, orderId, 1)
    const emailed = await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "email"))
    expect(emailed.map((job) => job.payload)).toEqual([expect.objectContaining({ type: "po", orderId })])
    // The email names the purchase order, its buyer and required-by date, with the PDF attached.
    vi.stubEnv("APP_URL", "https://copacker.example")
    vi.stubEnv("EMAIL_API_KEY", "test")
    vi.stubEnv("EMAIL_FROM", "copacker@example.com")
    const send = vi.fn<typeof fetch>(async () => Response.json({ id: "sent" }))
    vi.stubGlobal("fetch", send)
    const currentPo = () =>
      database
        .select({ id: tables.documents.id })
        .from(tables.documents)
        .where(and(eq(tables.documents.kind, "purchase_order"), eq(tables.documents.outdated, 0)))
    const filed = await currentPo()
    expect(filed).toHaveLength(1)
    storage.getFile.mockResolvedValue(new TextEncoder().encode("%PDF-"))
    await emailJob(emailed[0]!.payload, emailed[0]!.key, async () => undefined)
    // The email attaches the PDF filed when the PO was sent, so the link on the PO's page keeps working.
    expect(await currentPo()).toEqual(filed)
    const sent = JSON.parse(String(send.mock.calls[0]![1]!.body)) as { html: string; text: string }
    expect(sent).toMatchObject({
      to: ["supplier@example.com"],
      subject: "Purchase order PO-TEST from Buyer",
      attachments: [{ filename: "PO-TEST.pdf" }]
    })
    for (const version of [sent.html, sent.text]) {
      // It sums up the PDF: the units, where they go, the required-by date, each line and the total.
      for (const copy of [
        "Buyer sent you a purchase order for 160 units of 1 product.",
        "Amazon AWD US",
        "Oct 20, 2026",
        "Foil body cord",
        "Two-pack, B-2",
        "$336",
        "The purchase order PDF is attached.",
        `https://copacker.example/orders/${orderId}`
      ]) {
        expect(version).toContain(copy)
      }
    }

    await pg.exec("TRUNCATE jobs, shipments CASCADE")
    await database.update(tables.orders).set({ status: "draft", revision: 1 })
    await database.update(tables.suppliers).set({ supplierOrgId: null }).where(eq(tables.suppliers.id, supplierLinkId))
    await submitOrder(buyer, orderId, 1)
    expect(await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "email"))).toHaveLength(0)
  })
  it("emails the supplier which shipment's labels are ready, numbered as the app numbers them", async () => {
    const packing = packingSchema.parse({
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
      cartons: [
        { cartonId: "A1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 80 }] },
        { cartonId: "A2", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 80 }] }
      ]
    })
    const [, second] = await database
      .insert(tables.shipments)
      .values([
        { orderId, orderRevision: 1, createdAt: new Date("2026-09-01T00:00:00Z") },
        {
          orderId,
          orderRevision: 1,
          createdAt: new Date("2026-09-02T00:00:00Z"),
          packing,
          snapshot: orderData,
          amazonNetwork: "awd_us",
          amazonShipmentId: "STAR-1, STAR-2"
        }
      ])
      .returning({ id: tables.shipments.id })
    vi.stubEnv("APP_URL", "https://copacker.example")
    vi.stubEnv("EMAIL_API_KEY", "test")
    vi.stubEnv("EMAIL_FROM", "copacker@example.com")
    const send = vi.fn<typeof fetch>(async () => Response.json({ id: "sent" }))
    vi.stubGlobal("fetch", send)
    const payload = { type: "ready", to: "supplier@example.com", orderId, shipmentId: second!.id }
    await emailJob(payload, `ready:${second!.id}:1`, async () => undefined)
    const sent = JSON.parse(String(send.mock.calls[0]![1]!.body)) as { subject: string; html: string; text: string }
    expect(sent.subject).toBe("Labels ready for PO-TEST, shipment 2")
    for (const version of [sent.html, sent.text]) {
      // It says what's in the shipment and where it goes, as its packing list does.
      for (const copy of [
        "Buyer released the shipment",
        "Amazon AWD US",
        "Oct 15, 2026",
        "STAR-1, STAR-2",
        `https://copacker.example/shipments/${second!.id}`
      ]) {
        expect(version).toContain(copy)
      }
    }
    expect(sent.text).toMatch(/Cartons +2\n/)
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
    expect((await database.select().from(tables.shipments))[0]).toMatchObject({ status: "packed", packingDraft: null })
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
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
    await expect(submitPacking(supplier, prepared.id, undefined, 2)).rejects.toThrow("purchase order changed")
    await savePacking(supplier, prepared.id, prepared.packing, 2, 2)
    await submitPacking(supplier, prepared.id, undefined, 3)
    expect((await database.select().from(tables.shipments))[0]).toMatchObject({ status: "packed", orderRevision: 2 })
  })
  it("saves a ready date that has passed in a draft, but doesn't finish packing with it", async () => {
    const prepared = await preparation()
    const passed = { ...prepared.packing, readyDate: "2026-10-05" }
    await savePacking(supplier, prepared.id, passed, 1, 1)
    const checked = await checkPacking(supplier, prepared.id)
    expect(checked.canSubmit).toBe(false)
    expect(checked.issues).toEqual([
      { code: "ready_date_passed", field: "readyDate", message: "Choose a ready date of today or later" }
    ])
    await expect(submitPacking(supplier, prepared.id, undefined, 2)).rejects.toThrow(
      "Choose a ready date of today or later"
    )
    expect((await database.select().from(tables.shipments))[0]).toMatchObject({
      status: "packing",
      packingDraft: { readyDate: "2026-10-05" }
    })
  })
  it("reopens finished packing until the buyer starts the Amazon shipment", async () => {
    const prepared = await preparation()
    await submitPacking(supplier, prepared.id, prepared.packing, 1)
    const [packed] = await database.select().from(tables.shipments)
    expect(packed).toMatchObject({ status: "packed", packingDraft: null })
    await expect(reopenPacking(supplier, prepared.id, packed!.revision + 1)).rejects.toThrow("can’t be edited")
    await expect(reopenPacking(actor("supplier", otherId), prepared.id, packed!.revision)).rejects.toThrow("not found")
    await reopenPacking(supplier, prepared.id, packed!.revision)
    const [reopened] = await database.select().from(tables.shipments)
    expect(reopened).toMatchObject({ status: "packing", revision: packed!.revision + 1 })
    expect(reopened?.packingDraft).toEqual(packed?.packing)
    expect((await database.select().from(tables.events)).some((event) => event.messageKey === "packingReopened")).toBe(
      true
    )
    // Once it's back in packing, there's nothing finished to reopen.
    await expect(reopenPacking(supplier, prepared.id, reopened!.revision)).rejects.toThrow("can’t be edited")
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
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
  })
  it("rejects unknown draft products and never exposes private document keys", async () => {
    const prepared = await preparation()
    await expect(
      savePacking(supplier, prepared.id, { cartons: [{ items: [{ itemId: randomUUID(), pieces: 10 }] }] }, 1, 1)
    ).rejects.toThrow("isn’t on this purchase order")
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
      .mockResolvedValueOnce(call("search_shopify_products", { queries: ["supplier-1"] }))
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
    t.fetcher.mockResolvedValueOnce(call("search_shopify_products", { queries: ["cord"], orgId: otherId }))
    await expect(importJob({ id: t.id, revision: 1 }, async () => Promise.resolve())).rejects.toThrow(
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
    await importJob({ id: t.id, revision: 1 }, async () => Promise.resolve())
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
      .mockResolvedValueOnce(call("search_shopify_products", { queries: ["foil-2"] }))
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
    t.fetcher.mockResolvedValueOnce(call("search_shopify_products", { queries: ["cord"] }))
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
      .mockResolvedValueOnce(call("search_shopify_products", { queries: ["supplier-1"] }))
      .mockImplementationOnce(async (_url, init) => {
        const sent = JSON.parse(String(init?.body))
        const results = JSON.parse(sent.messages.at(-1).content)
        expect(results.searches[0].results.slice(0, 2).map((v: { id: string }) => v.id)).toEqual(exact.map((v) => v.id))
        expect(results.searches[0].matchesTruncated).toBe(true)
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
      .mockResolvedValueOnce(call("search_shopify_products", { queries: ["foil-2"] }))
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
    ).rejects.toThrow("last 2 years")
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
  // Its origin check is the HTTP boundary's, in http-response.test.ts.
  it("rejects tenant overrides and suppliers", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000")
    const request = (body: unknown) =>
      new Request("http://localhost:3000/api/inventory/demand", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    const body = { source: "amazon", window: window() }
    expect((await readDemand(request({ ...body, orgId: otherId }))).status).toBe(400)
    context.actor = supplier
    expect((await readDemand(request(body))).status).toBe(403)
    expect(provider.api.request).not.toHaveBeenCalled()
  })
  it("returns safe errors and private caching rather than provider diagnostics", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000")
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
  // On a whole minute, so a timestamp ends in "00.000Z" and a search such as "10.00" never matches the clock.
  const daysAgo = (days: number) => new Date(Math.floor(Date.now() / 60000) * 60000 - days * 86400000).toISOString()
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
      // The order sync also copies Amazon's transactions for fees; none are posted here.
      if (path.startsWith("/finances/")) {
        return { payload: { transactions: [] } }
      }
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
    // Two years, less a day, in 14-day periods.
    expect(first.chunks).toHaveLength(53)
    expect(first.chunks[0]!.to.getTime()).toBe(end)
    expect(first.chunks.at(-1)!.from.getTime()).toBe(end - 729 * 86400000)
    // The full history stored until yesterday: only the last 31 days are read again.
    const later = syncChunks(now, { coveredFrom: first.chunks.at(-1)!.from, coveredTo: new Date(now - 86400000) })
    expect(later.fresh).toBe(false)
    expect(later.chunks).toHaveLength(3)
    expect(later.chunks[0]!.from.getTime()).toBe(now - 31 * 86400000)
    // 180 days stored: refresh the recent end, then extend backwards from the stored start.
    const storedFrom = new Date(end - 180 * 86400000)
    const extended = syncChunks(now, { coveredFrom: storedFrom, coveredTo: new Date(end) })
    expect(extended.chunks.slice(0, 3).map((chunk) => chunk.to.getTime() <= end)).toEqual([true, true, true])
    expect(extended.chunks[3]).toEqual({ from: new Date(storedFrom.getTime() - 14 * 86400000), to: storedFrom })
    expect(extended.chunks.at(-1)!.from.getTime()).toBe(end - 729 * 86400000)
    // A stored range entirely before the history start is replaced.
    expect(syncChunks(now, { coveredFrom: new Date(0), coveredTo: new Date(86400000) }).fresh).toBe(true)
  })
  it("starts a new store's orders and each of its stock sources, and reports how much history is copied", async () => {
    await startFirstSync(buyer.org, "amazon")
    await startFirstSync(buyer.org, "amazon")
    const queued = await database.select({ kind: tables.jobs.kind }).from(tables.jobs)
    expect(queued.map((job) => job.kind).toSorted()).toEqual(["sales", "stock", "stock"])
    const snapshots = await database.select().from(tables.stockSnapshots)
    expect(snapshots.map((row) => [row.source, row.status]).toSorted()).toEqual([
      ["awd", "queued"],
      ["fba", "queued"]
    ])
    const amazon = (await salesSyncStatus(buyerId)).find((state) => state.source === "amazon")
    expect(amazon).toMatchObject({ status: "queued", progress: 0 })
  })
  it("measures a first sync's progress by the history copied, and has none for later syncs", () => {
    const day = 86400000
    const now = Date.now()
    const copying = (days: number) => ({
      status: "running",
      coveredFrom: new Date(now - days * day),
      coveredTo: new Date(now)
    })
    expect(orderSyncProgress({ status: "queued", coveredFrom: null, coveredTo: null }, 60)).toBe(0)
    expect(orderSyncProgress(copying(15), 60)).toBe(0.25)
    // A later sync already has the history.
    expect(orderSyncProgress(copying(60), 60)).toBeNull()
    expect(orderSyncProgress({ ...copying(15), status: "idle" }, 60)).toBeNull()
  })
  it("copies orders, lists them and computes demand without asking Amazon again", async () => {
    amazonOrders([amazonOrder("111-1", daysAgo(10), 2), amazonOrder("111-2", daysAgo(100), 3)])
    await expect(storedDemand(buyerId, "amazon", 28)).rejects.toThrow("Sync Amazon orders")
    expect(await requestSalesSync(buyer.org, "amazon")).toEqual({ status: "queued" })
    expect(await requestSalesSync(buyer.org, "amazon")).toEqual({ status: "queued" })
    expect(await database.select().from(tables.jobs)).toHaveLength(1)
    await drainSales()
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ status: "idle", externalAccountId: "A123456789", errorCode: null })
    expect(await salesSyncStatus(buyerId)).toMatchObject([{ source: "amazon", recent: { orders: 1, units: 2 } }])
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
    await expect(storedDemand(buyerId, "amazon", 800)).rejects.toThrow("go back 729 days")
    expect(provider.api.request.mock.calls.length).toBe(calls)
  })
  it("leaves out Shopify orders with an excluded tag, such as Shopify's copies of Amazon orders", async () => {
    amazonOrders([amazonOrder("111-1", daysAgo(10), 2)])
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    const shop = "test.myshopify.com"
    await database
      .insert(tables.connections)
      .values({ orgId: buyerId, provider: "shopify", externalId: shop, encryptedToken: "test-only", scopes: "" })
    const shopifyOrder = (id: string, name: string, sourceName: string, tags: string[] = []) => ({
      orgId: buyerId,
      source: "shopify" as const,
      externalAccountId: shop,
      orderId: id,
      orderedAt: new Date(daysAgo(9)),
      data: {
        id,
        name,
        createdAt: daysAgo(9),
        cancelledAt: null,
        test: false,
        sourceName,
        tags,
        lines: [],
        fulfillments: [],
        transactions: []
      }
    })
    await database.insert(tables.salesOrders).values([
      shopifyOrder("gid://shopify/Order/1", "#1001", "web"),
      shopifyOrder("gid://shopify/Order/2", "#1002", "amazon-us", ["amazon", "FBA"]),
      // An untagged order remains included.
      {
        ...shopifyOrder("gid://shopify/Order/3", "#1003", "amazon"),
        data: { ...shopifyOrder("gid://shopify/Order/3", "#1003", "amazon").data, tags: [] }
      }
    ])
    expect((await shopifyOrderTags(buyerId)).toSorted()).toEqual(["FBA", "amazon"].toSorted())
    const shopifyStatus = async () => (await salesSyncStatus(buyerId)).find((state) => state.source === "shopify")
    expect(await shopifyStatus()).toMatchObject({ orders: 2, recent: { orders: 2 } })
    const listed = await listSalesOrders(buyerId, { page: 0 })
    expect(listed.total).toBe(3)
    expect(listed.orders.map((order) => order.number).toSorted()).toEqual(["#1001", "#1003", "111-1"])
    expect((await listSalesOrders(buyerId, { page: 0, source: "shopify" })).total).toBe(2)
    // Orders are found by their products' titles: Amazon's by SKU, Shopify's by variant.
    const catalogRow = {
      inventoryItemId: "gid://shopify/InventoryItem/77",
      tracked: true,
      unit: "shopify_inventory_unit" as const,
      levels: [],
      productId: "gid://shopify/Product/77",
      imageUrl: null,
      productTitle: "Foil Wire",
      variantTitle: "Red / Left"
    }
    await database.insert(tables.stockSnapshots).values({
      orgId: buyerId,
      source: "shopify",
      externalAccountId: shop,
      scopeKey: "store",
      data: {
        source: "shopify",
        scopeKey: "store",
        shopifyDomain: shop,
        startedAt: daysAgo(1),
        observedAt: daysAgo(1),
        rows: [
          { ...catalogRow, variantId: "gid://shopify/ProductVariant/77", buyerSku: "foil-2" },
          {
            ...catalogRow,
            variantId: "gid://shopify/ProductVariant/78",
            buyerSku: null,
            productTitle: "Mask Cord",
            variantTitle: "Default Title"
          }
        ]
      }
    })
    const line = {
      id: "gid://shopify/LineItem/1",
      quantity: 1,
      currentQuantity: 1,
      sku: null,
      variant: { id: "gid://shopify/ProductVariant/78" },
      lineItemGroup: null,
      originalUnitPriceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } },
      discountAllocations: []
    }
    await database
      .update(tables.salesOrders)
      .set({ data: { ...shopifyOrder("gid://shopify/Order/1", "#1001", "web").data, lines: [line] } })
      .where(eq(tables.salesOrders.orderId, "gid://shopify/Order/1"))
    const found = async (q: string) =>
      (await listSalesOrders(buyerId, { page: 0, q })).orders.map((order) => order.number).toSorted()
    expect(await found("wire left")).toEqual(["111-1"])
    expect(await found("mask CORD")).toEqual(["#1001"])
    expect(await found("wire mask")).toEqual([])
    // Someone who doesn't see prices can't find orders by their amounts, only by number, SKU and product.
    const unpriced = async (q: string) =>
      (await listSalesOrders(buyerId, { page: 0, q }, { prices: false })).orders.map((order) => order.number).toSorted()
    expect(await found("10.00")).toEqual(["#1001"])
    expect(await unpriced("10.00")).toEqual([])
    expect(await unpriced("1001")).toEqual(["#1001"])
    expect(await unpriced("FOIL-2")).toEqual(["111-1"])
    expect(await unpriced("mask cord")).toEqual(["#1001"])
    // Restock doesn't count them as Shopify demand either.
    await database.insert(tables.salesSyncs).values({
      orgId: buyerId,
      source: "shopify",
      externalAccountId: shop,
      coveredFrom: new Date(daysAgo(40)),
      coveredTo: new Date()
    })
    await database
      .update(tables.salesOrders)
      .set({
        data: {
          ...shopifyOrder("gid://shopify/Order/2", "#1002", "amazon-us", ["amazon", "FBA"]).data,
          lines: [{ ...line, id: "gid://shopify/LineItem/2", variant: { id: "gid://shopify/ProductVariant/79" } }]
        }
      })
      .where(eq(tables.salesOrders.orderId, "gid://shopify/Order/2"))
    const demand = await storedDemand(buyerId, "shopify", 28)
    expect([...demand.saleDays.keys()]).toEqual(["gid://shopify/ProductVariant/78"])
    expect(demand.gaps.map((gap) => gap.variantId)).not.toContain("gid://shopify/ProductVariant/79")
    // With no excluded tags, every Shopify order counts.
    const save = (tags: string[]) =>
      action(
        new Request("http://localhost:3000/api/action", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ action: "workspace.excludedShopifyTags", data: { tags } })
        })
      )
    expect((await save([])).status).toBe(200)
    expect(await shopifyStatus()).toMatchObject({ orders: 3, recent: { orders: 3 } })
    expect((await listSalesOrders(buyerId, { page: 0 })).total).toBe(4)
    expect((await save([" FBA ", "fba", "Amazon"])).status).toBe(200)
    const [org] = await database.select().from(tables.organizations).where(eq(tables.organizations.id, buyerId))
    expect(org?.excludedShopifyTags).toEqual(["FBA", "Amazon"])
    expect(await shopifyStatus()).toMatchObject({ orders: 2 })
    // * matches any run of characters, and _ or % match only themselves.
    expect((await save(["AMA*"])).status).toBe(200)
    expect(await shopifyStatus()).toMatchObject({ orders: 2 })
    expect((await save(["*b*"])).status).toBe(200)
    expect(await shopifyStatus()).toMatchObject({ orders: 2 })
    expect((await save(["f_a", "a%"])).status).toBe(200)
    expect(await shopifyStatus()).toMatchObject({ orders: 3 })
    await database.delete(tables.salesOrders).where(eq(tables.salesOrders.orderId, "gid://shopify/Order/3"))
  })
  it("drops orders that disappear from the source when the period is synced again", async () => {
    amazonOrders([amazonOrder("111-1", daysAgo(10), 2), amazonOrder("111-2", daysAgo(100), 3)])
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    amazonOrders([amazonOrder("111-2", daysAgo(100), 3)])
    const orderReads = () =>
      provider.api.request.mock.calls.filter((call) => String(call[1]).startsWith("/orders/")).length
    const before = orderReads()
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    expect((await listSalesOrders(buyerId, { page: 0 })).orders.map((order) => order.number)).toEqual(["111-2"])
    // Only the recent periods are read again.
    expect(orderReads() - before).toBe(3)
  })
  it("gets a current Shopify token for each period, so a long sync outlives an hour-long token", async () => {
    await database.insert(tables.connections).values({
      orgId: buyerId,
      provider: "shopify",
      externalId: "test.myshopify.com",
      encryptedToken: "test-only",
      scopes: "read_orders"
    })
    const graphql = vi.fn<() => Promise<unknown>>().mockResolvedValue({
      shop: { myshopifyDomain: "test.myshopify.com" },
      orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
    })
    provider.shopifyFor.mockResolvedValue({ graphql })
    await requestSalesSync(buyer.org, "shopify")
    await drainSales()
    const [sync] = await database
      .select()
      .from(tables.salesSyncs)
      .where(and(eq(tables.salesSyncs.orgId, buyerId), eq(tables.salesSyncs.source, "shopify")))
    expect(sync?.status).toBe("idle")
    // 60 days of history (no read_all_orders) is five 14-day periods, each with its own client.
    // Financial evidence is queued independently.
    expect(graphql).toHaveBeenCalledTimes(5)
    expect(provider.shopifyFor).toHaveBeenCalledTimes(5)
    // Without the payouts permission, labels and Shopify charges wait for the store to reconnect.
    expect(sync?.feesErrorCode).toBe("reconnect")
    expect(sync?.customersIncluded).toBe(false)
    // Granting customer access must reread history, not merely refresh its most recent 30 days.
    await database
      .update(tables.connections)
      .set({ scopes: "read_orders,read_customers" })
      .where(and(eq(tables.connections.orgId, buyerId), eq(tables.connections.provider, "shopify")))
    // Finish the independent analytics job queued by the preceding sales sync.
    await runNextJob()
    graphql.mockClear()
    await requestSalesSync(buyer.org, "shopify")
    await drainSales()
    const [withCustomers] = await database
      .select()
      .from(tables.salesSyncs)
      .where(and(eq(tables.salesSyncs.orgId, buyerId), eq(tables.salesSyncs.source, "shopify")))
    expect(withCustomers).toMatchObject({ status: "idle", customersIncluded: true })
    expect(graphql).toHaveBeenCalledTimes(5)
    // Subsequent syncs preserve customer coverage and read only the recent window.
    // Finish the independent analytics job queued by the preceding sales sync.
    await runNextJob()
    graphql.mockClear()
    await requestSalesSync(buyer.org, "shopify")
    await drainSales()
    expect(graphql).toHaveBeenCalledTimes(3)
  })

  it("restarts the complete history when customer permission changes between checkpoints", async () => {
    await database.insert(tables.connections).values({
      orgId: buyerId,
      provider: "shopify",
      externalId: "test.myshopify.com",
      encryptedToken: "test-only",
      scopes: "read_orders"
    })
    const graphql = vi.fn<() => Promise<unknown>>().mockResolvedValue({
      shop: { myshopifyDomain: "test.myshopify.com" },
      orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
    })
    provider.shopifyFor.mockResolvedValue({ graphql })
    await requestSalesSync(buyer.org, "shopify")
    await runNextJob()
    expect(graphql).toHaveBeenCalledTimes(1)
    await database
      .update(tables.connections)
      .set({ scopes: "read_orders,read_customers" })
      .where(eq(tables.connections.orgId, buyerId))
    await database
      .update(tables.jobs)
      .set({ runAt: new Date(0) })
      .where(eq(tables.jobs.kind, "sales"))
    graphql.mockClear()
    await drainSales()
    // Re-read all five periods, including the one read before customer permission was granted.
    expect(graphql).toHaveBeenCalledTimes(5)
    const [sync] = await database.select().from(tables.salesSyncs).where(eq(tables.salesSyncs.orgId, buyerId))
    expect(sync).toMatchObject({ status: "idle", customersIncluded: true })
  })

  it("starts a sync again when the job of one still marked queued has failed", async () => {
    await requestSalesSync(buyer.org, "amazon")
    await database.update(tables.jobs).set({ status: "failed", error: "Unknown job type" })
    expect(await requestSalesSync(buyer.org, "amazon")).toEqual({ status: "queued" })
    const [sync] = await database.select().from(tables.salesSyncs).where(eq(tables.salesSyncs.orgId, buyerId))
    expect(sync?.revision).toBe(2)
    const pending = await database.select().from(tables.jobs).where(eq(tables.jobs.status, "pending"))
    expect(pending.map((job) => job.key)).toEqual([`sales:${buyerId}:amazon:2`])
  })

  it("pauses an Amazon sync that's throttled and resumes where it stopped, without holding the worker", async () => {
    const orders = [amazonOrder("111-1", daysAgo(3), 1), amazonOrder("111-2", daysAgo(40), 2)]
    const reads: string[] = []
    let throttle = true
    provider.api.request.mockImplementation(async (_method: string, path: string) => {
      if (path.startsWith("/finances/")) {
        return { payload: { transactions: [] } }
      }
      const query = new URL(path, "https://amazon.test").searchParams
      const from = Date.parse(query.get("createdAfter") ?? ""),
        to = Date.parse(query.get("createdBefore") ?? "")
      reads.push(query.get("createdAfter") ?? "")
      // The third period read is refused once.
      if (reads.length === 3 && throttle) {
        throttle = false
        throw new ProviderError(429, null, "throttled")
      }
      return {
        orders: orders.filter((order) => Date.parse(order.createdTime) >= from && Date.parse(order.createdTime) < to)
      }
    })
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    const [paused] = await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "sales"))
    expect(paused).toMatchObject({ status: "pending", attempts: 1 })
    expect(paused!.runAt.getTime()).toBeGreaterThan(Date.now() + 170000)
    const resume = (paused!.payload as { resume: { remaining: { from: string }[]; covered: unknown } }).resume
    expect(resume.remaining[0]!.from).toBe(reads[2])
    expect(resume.covered).not.toBeNull()
    const [waiting] = await database.select().from(tables.salesSyncs).where(eq(tables.salesSyncs.orgId, buyerId))
    expect(waiting?.status).toBe("running")

    await database.update(tables.jobs).set({ runAt: new Date() }).where(eq(tables.jobs.id, paused!.id))
    await drainSales()
    // The two periods read before the pause aren't read again.
    expect(reads.slice(3, 4)).toEqual([reads[2]])
    expect(reads.filter((from) => from === reads[0])).toHaveLength(1)
    const [done] = await database.select().from(tables.salesSyncs).where(eq(tables.salesSyncs.orgId, buyerId))
    expect(done?.status).toBe("idle")
    expect((await listSalesOrders(buyerId, { page: 0 })).orders.map((order) => order.number)).toEqual([
      "111-1",
      "111-2"
    ])
  })

  it("copies Amazon's transactions for fees", async () => {
    const posted = daysAgo(5)
    provider.api.request.mockImplementation(async (_method: string, path: string) => {
      if (!path.startsWith("/finances/")) {
        return { orders: [] }
      }
      const query = new URL(path, "https://amazon.test").searchParams
      const inWindow =
        Date.parse(posted) >= Date.parse(query.get("postedAfter") ?? "") &&
        Date.parse(posted) < Date.parse(query.get("postedBefore") ?? "")
      return {
        payload: {
          transactions: inWindow
            ? [
                {
                  transactionId: "t1",
                  transactionType: "Shipment",
                  postedDate: posted,
                  totalAmount: { currencyCode: "USD", currencyAmount: 12 },
                  relatedIdentifiers: [{ relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "111-1" }],
                  breakdowns: [
                    { breakdownType: "AmazonFees", breakdownAmount: { currencyCode: "USD", currencyAmount: -3 } }
                  ]
                }
              ]
            : []
        }
      }
    })
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    const [sync] = await database.select().from(tables.salesSyncs).where(eq(tables.salesSyncs.orgId, buyerId))
    expect(sync).toMatchObject({ status: "idle", feesErrorCode: null })
    expect(sync?.feesCoveredTo).not.toBeNull()
    expect((await salesSyncStatus(buyerId)).find((state) => state.source === "amazon")?.fees).toEqual({
      coveredFrom: sync?.feesCoveredFrom?.toISOString(),
      coveredTo: sync?.feesCoveredTo?.toISOString(),
      errorCode: null
    })
    expect(
      await database
        .select({
          transactionId: tables.amazonTransactions.transactionId,
          orderId: tables.amazonTransactions.orderId,
          totalMinor: tables.amazonTransactions.totalMinor,
          feesMinor: tables.amazonTransactions.feesMinor
        })
        .from(tables.amazonTransactions)
    ).toEqual([{ transactionId: "t1", orderId: "111-1", totalMinor: 1200, feesMinor: 300 }])
  })
  it("imports reimbursement evidence through the sales worker and exposes its independent coverage", async () => {
    amazonOrders([])
    const approvedAt = new Date(Date.now() - 86400000).toISOString()
    provider.api.report.mockImplementation(
      async (input: { reportType: string; dataStartTime: string; dataEndTime: string }) => {
        if (input.reportType !== "GET_FBA_REIMBURSEMENTS_DATA") {
          return null
        }
        const included = approvedAt >= input.dataStartTime && approvedAt <= input.dataEndTime
        return reimbursementReport(included ? [{ "approval-date": approvedAt }] : [])
      }
    )
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    expect(await database.select().from(tables.amazonReimbursements)).toMatchObject([
      { reimbursementId: "R1", amountTotal: "6.246912", externalAccountId: "A123456789" }
    ])
    const state = (await salesSyncStatus(buyerId)).find((source) => source.source === "amazon")
    expect(state?.status).toBe("idle")
    expect(state?.reimbursements?.windows.every((window) => window.complete)).toBe(true)
    expect(state?.returns?.windows.every((window) => !window.complete)).toBe(true)
    expect(await database.select().from(tables.amazonTransactions)).toEqual([])
  })
  it("imports detailed inventory movements through the worker independently of returns and reimbursements", async () => {
    amazonOrders([])
    const eventDay = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    provider.api.report.mockImplementation(
      async (input: { reportType: string; dataStartTime: string; dataEndTime: string }) => {
        if (input.reportType !== "GET_LEDGER_DETAIL_VIEW_DATA") {
          return null
        }
        const included = eventDay >= input.dataStartTime.slice(0, 10) && eventDay <= input.dataEndTime.slice(0, 10)
        return inventoryMovementReport(included ? [{ Date: eventDay }] : [])
      }
    )
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    expect(await database.select().from(tables.amazonInventoryMovements)).toMatchObject([
      { eventDay, quantity: -3, referenceId: "REF1", externalAccountId: "A123456789" }
    ])
    const state = (await salesSyncStatus(buyerId)).find((source) => source.source === "amazon")
    expect(state?.status).toBe("idle")
    expect(state?.inventoryMovements?.windows.every((window) => window.complete)).toBe(true)
    expect(state?.reimbursements?.windows.every((window) => !window.complete)).toBe(true)
    expect(await database.select().from(tables.stockDays)).toEqual([])
  })
  it("imports both storage sources through the worker with independent coverage and no financial postings", async () => {
    amazonOrders([])
    provider.api.report.mockImplementation(async (input: { reportType: string; dataStartTime: string }) => {
      if (input.reportType === "GET_FBA_STORAGE_FEE_CHARGES_DATA") {
        return monthlyStorageReport([{ month_of_charge: input.dataStartTime.slice(0, 7) }])
      }
      if (input.reportType === "GET_FBA_FULFILLMENT_LONGTERM_STORAGE_FEE_CHARGES_DATA") {
        return agedStorageReport([{ "snapshot-date": input.dataStartTime.slice(0, 10) }])
      }
      return null
    })
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    expect(await database.select().from(tables.amazonStorageFees)).toHaveLength(24)
    const state = (await salesSyncStatus(buyerId)).find((source) => source.source === "amazon")
    expect(state?.status).toBe("idle")
    expect(state?.storageFees?.monthly.windows.every((window) => window.complete)).toBe(true)
    expect(state?.storageFees?.aged.windows.every((window) => window.complete)).toBe(true)
    expect(state?.returns?.windows.every((window) => !window.complete)).toBe(true)
    expect(await database.select().from(tables.amazonTransactions)).toEqual([])
  })
  it("imports removal orders and shipments through the worker without duplicate stock or money postings", async () => {
    amazonOrders([])
    provider.api.report.mockImplementation(async (input: { reportType: string; dataStartTime: string }) => {
      if (input.reportType === "GET_FBA_FULFILLMENT_REMOVAL_ORDER_DETAIL_DATA") {
        return removalReport("orders", [{ "request-date": input.dataStartTime }])
      }
      if (input.reportType === "GET_FBA_FULFILLMENT_REMOVAL_SHIPMENT_DETAIL_DATA") {
        return removalReport("shipments", [{ "shipment-date": input.dataStartTime }])
      }
      return null
    })
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    const state = (await salesSyncStatus(buyerId)).find((source) => source.source === "amazon")
    expect(state?.status).toBe("idle")
    expect(state?.removals?.orders.windows.every((window) => window.complete)).toBe(true)
    expect(state?.removals?.shipments.windows.every((window) => window.complete)).toBe(true)
    expect(state?.storageFees?.monthly.windows.every((window) => !window.complete)).toBe(true)
    expect(await database.select().from(tables.amazonRemovals)).toHaveLength(2)
    expect(await database.select().from(tables.amazonRemovalReports)).toHaveLength(
      (state?.removals?.orders.windows.length ?? 0) * 2
    )
    expect(await database.select().from(tables.amazonTransactions)).toEqual([])
    expect(await database.select().from(tables.stockDays)).toEqual([])
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
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
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
    await requestSalesSync(buyer.org, "amazon")
    await drainSales()
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ status: "failed", errorCode: "refresh_failed", coveredTo: null })
    await expect(requestSalesSync(supplier.org, "amazon")).rejects.toThrow("buyer workspace")
  })
})

describe("supplier lead times", () => {
  it("renames suppliers and saves lead times only for the buyer's own current suppliers", async () => {
    const edit = { id: supplierLinkId, name: "Renamed", leadTimeDays: 45 }
    await updateSupplier(buyerId, edit)
    const [link] = await database.select().from(tables.suppliers).where(eq(tables.suppliers.id, supplierLinkId))
    expect(link).toMatchObject({ name: "Renamed", leadTimeDays: 45 })
    await expect(updateSupplier(otherId, { ...edit, leadTimeDays: 1 })).rejects.toThrow("removed")
    await expect(updateSupplier(buyerId, { ...edit, leadTimeDays: 0 })).rejects.toThrow("expected number to be >=1")
    await database.insert(tables.suppliers).values({ buyerOrgId: buyerId, name: "Taken", email: "taken@example.com" })
    await expect(updateSupplier(buyerId, { ...edit, name: "Taken" })).rejects.toThrow("already has this name")
  })

  it("keeps a supplier's contact details until the supplier joins, then leaves them to the supplier", async () => {
    const edit = { id: supplierLinkId, name: "Supplier", leadTimeDays: null }
    const contact = { contactName: "Wei Chen", contactEmail: "wei@supplier.example", phoneNumber: "", website: "" }
    const saved = async () =>
      (await database.select().from(tables.suppliers).where(eq(tables.suppliers.id, supplierLinkId)))[0]
    await database.update(tables.suppliers).set({ supplierOrgId: null }).where(eq(tables.suppliers.id, supplierLinkId))
    await updateSupplier(buyerId, { ...edit, ...contact })
    expect(await saved()).toMatchObject({
      contactName: "Wei Chen",
      contactEmail: "wei@supplier.example",
      phoneNumber: null,
      website: null
    })
    await expect(updateSupplier(buyerId, { ...edit, contactEmail: "not an email" })).rejects.toThrow(
      "partners.contactDetails.enterEmail"
    )
    await expect(updateSupplier(buyerId, { ...edit, phoneNumber: "call me" })).rejects.toThrow("partners.phone.invalid")
    await expect(updateSupplier(buyerId, { ...edit, website: "supplier" })).rejects.toThrow(
      "onboarding.company.enterWebsite"
    )
    // A website typed without https:// is saved with it; details left out stay as they were.
    await updateSupplier(buyerId, { ...edit, website: "supplier.example", phoneNumber: "+86 188 6161 3263" })
    expect(await saved()).toMatchObject({
      contactName: "Wei Chen",
      phoneNumber: "+86 188 6161 3263",
      website: "https://supplier.example"
    })
    // Joined: the buyer's changes to them are ignored.
    await database
      .update(tables.suppliers)
      .set({ supplierOrgId: supplierId })
      .where(eq(tables.suppliers.id, supplierLinkId))
    await updateSupplier(buyerId, { ...edit, contactName: "Someone else" })
    expect((await saved())?.contactName).toBe("Wei Chen")
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

describe("store time zone", () => {
  const save = (timeZone: string) =>
    action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: "workspace.timeZone", data: { timeZone } })
      })
    )

  it("saves a time zone the runtime knows for the workspace", async () => {
    expect((await save("America/Los_Angeles")).status).toBe(200)
    const [org] = await database
      .select({ timeZone: tables.organizations.timeZone })
      .from(tables.organizations)
      .where(eq(tables.organizations.id, buyerId))
    expect(org?.timeZone).toBe("America/Los_Angeles")
    expect((await save("Mars/Olympus")).status).toBe(400)
  })
})

describe("restock settings", () => {
  const save = (data: Record<string, unknown>) =>
    action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: "workspace.restock", data })
      })
    )
  const settings = async () => {
    const [org] = await database.select().from(tables.organizations).where(eq(tables.organizations.id, buyerId))
    return restockSettings(org!)
  }

  it("starts from the defaults and keeps the workspace's own sales period and lead time", async () => {
    expect(await settings()).toEqual(restockDefaults)
    expect((await save({ salesDays: 90, leadTimeDays: 45 })).status).toBe(200)
    expect(await settings()).toEqual({ days: 90, leadTimeDays: 45 })
    expect((await save({ salesDays: 0, leadTimeDays: 45 })).status).toBe(400)
  })
})

describe("landed costs", () => {
  const send = (name: string, data: Record<string, unknown>) =>
    action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: name, data })
      })
    )

  it("lets the buyer record freight and duty on a PO, and keeps them from the supplier", async () => {
    const created = await send("landedCost.create", {
      orderId,
      kind: "freight",
      description: "Forwarder invoice",
      amount: 12000
    })
    expect(created.status).toBe(200)
    const { id } = (await created.json()) as { id: string }
    expect(await orderLandedCosts(orderId)).toEqual([
      { id, kind: "freight", description: "Forwarder invoice", amountMinor: 12000 }
    ])
    expect((await send("landedCost.create", { orderId, kind: "duty", amount: 0 })).status).toBe(400)

    context.actor = supplier
    expect((await send("landedCost.create", { orderId, kind: "duty", amount: 500 })).status).toBe(403)
    expect((await send("landedCost.delete", { id })).status).toBe(403)

    context.actor = actor("buyer", otherId)
    expect((await send("landedCost.delete", { id })).status).toBe(400)

    context.actor = buyer
    expect((await send("landedCost.delete", { id })).status).toBe(200)
    expect(await orderLandedCosts(orderId)).toEqual([])
  })
})

describe("timeline comments", () => {
  const send = (data: Record<string, unknown>) =>
    action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: "order.comment", data: { visibility: "shared", ...data } })
      })
    )

  it("keeps a comment on the PO's timeline with its author, only for those who can see the PO", async () => {
    expect((await send({ orderId, message: "  Check the carton weights  " })).status).toBe(200)
    const [comment] = await database.select().from(tables.events).where(eq(tables.events.kind, "comment"))
    expect(comment).toMatchObject({
      orderId,
      message: "Check the carton weights",
      actor: buyer.user.id,
      author: buyer.user.name,
      authorOrg: buyer.org.name
    })
    expect((await send({ orderId, message: " " })).status).toBe(400)

    context.actor = actor("buyer", otherId)
    expect((await send({ orderId, message: "Not mine" })).status).not.toBe(200)
    context.actor = buyer
  })

  it("keeps internal comments within the author's workspace, even for a user who belongs to both", async () => {
    const { orderEvents } = await import("../src/server/comments")
    expect(
      (await send({ orderId, message: "Buyer only", visibility: "internal", internalOrgId: supplier.org.id })).status
    ).toBe(200)
    expect((await send({ orderId, message: "Shared", visibility: "shared" })).status).toBe(200)
    const buyerRows = await orderEvents(buyer, orderId)
    expect(buyerRows.filter((event) => event.kind === "comment").map((event) => event.message)).toEqual(
      expect.arrayContaining(["Buyer only", "Shared"])
    )
    expect(buyerRows.find((event) => event.message === "Buyer only")?.internalOrgId).toBe(buyer.org.id)
    const supplierRows = await orderEvents({ ...supplier, user: buyer.user }, orderId)
    expect(supplierRows.some((event) => event.message === "Buyer only")).toBe(false)
    expect(supplierRows.some((event) => event.message === "Shared")).toBe(true)
    await expect(orderEvents(actor("buyer", otherId), orderId)).rejects.toThrow("not found")
    expect((await send({ orderId, message: "Unknown audience", visibility: "everyone" })).status).toBe(400)
  })
})

describe("profiles", () => {
  it("keeps the name someone signed up with, and asks for one when there's none", async () => {
    expect(await profileFor({ id: "user-a", firstName: " Ada ", lastName: "Lovelace" })).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace"
    })
    // Their saved name wins over a later sign-in's.
    expect(await profileFor({ id: "user-a", firstName: "Other", lastName: "Name" })).toMatchObject({ firstName: "Ada" })
    expect(await profileFor({ id: "user-b", firstName: "Grace", lastName: null })).toBeNull()
    // A name from sign-in still needs a position and company.
    expect((await ownProfile("user-a")).complete).toBe(false)
  })

  it("saves a person's own name, trimmed", async () => {
    const profile = { firstName: " Tess ", lastName: "Tester ", position: "Buyer", company: "Fencing Club" }
    expect((await ownProfile(buyer.user.id)).complete).toBe(false)
    await saveProfile(buyer, profile)
    await saveProfile(buyer, { ...profile, firstName: "Tessa" })
    expect(await database.select().from(tables.profiles)).toMatchObject([
      { userId: buyer.user.id, firstName: "Tessa", lastName: "Tester", position: "Buyer", company: "Fencing Club" }
    ])
    expect((await ownProfile(buyer.user.id)).complete).toBe(true)
    await expect(saveProfile(buyer, { ...profile, position: " " })).rejects.toThrow("onboarding.person.choosePosition")
  })
})

describe("suppliers from Shopify and invitations", () => {
  const post = (body: unknown) =>
    action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    )
  const buyerSuppliers = () => database.select().from(tables.suppliers).where(eq(tables.suppliers.buyerOrgId, buyerId))

  it("adds Shopify's suppliers once, links a supplier named within one and keeps removed ones removed", async () => {
    await database.insert(tables.suppliers).values([
      { buyerOrgId: buyerId, name: "Guanda" },
      { buyerOrgId: buyerId, name: "Gone Co", removedAt: new Date() }
    ])
    const names = ["Wuxi Guanda Sport Goods Co. Ltd.", "Unic", " unic ", "Gone Co", "supplier", null, ""]
    expect(await syncShopifySuppliers(buyerId, names)).toEqual({ added: 1, linked: 1 })
    expect(await syncShopifySuppliers(buyerId, names)).toEqual({ added: 0, linked: 0 })
    const rows = await buyerSuppliers()
    expect(rows.find((row) => row.name === "Guanda")?.shopifySupplierName).toBe("Wuxi Guanda Sport Goods Co. Ltd.")
    expect(rows.find((row) => row.name === "Unic")).toMatchObject({ email: null, invitationHash: null })
    expect(rows.find((row) => row.name === "Gone Co")?.removedAt).not.toBeNull()
    expect(rows).toHaveLength(4)
  })

  it("adds a supplier without an email, then invites it by email", async () => {
    const created = await post({ action: "supplier.create", data: { name: "Unic", email: "" } })
    expect(created.status).toBe(200)
    const { id } = (await created.json()) as { id: string }
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    const [added] = await database.select().from(tables.suppliers).where(eq(tables.suppliers.id, id))
    expect(added).toMatchObject({ email: null, invitationHash: null })

    const noEmail = await post({ action: "supplier.invite", data: { id } })
    expect(noEmail.status).toBeGreaterThanOrEqual(400)
    expect(await database.select().from(tables.jobs)).toHaveLength(0)

    expect((await post({ action: "supplier.invite", data: { id, email: "Sales@Unic.example" } })).status).toBe(200)
    const [invited] = await database.select().from(tables.suppliers).where(eq(tables.suppliers.id, id))
    expect(invited?.email).toBe("sales@unic.example")
    expect(invited?.invitationHash).not.toBeNull()
    const jobs = await database.select().from(tables.jobs)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.payload).toMatchObject({ type: "invite", to: "sales@unic.example" })

    // Resending uses the saved email.
    expect((await post({ action: "supplier.resend", data: { id } })).status).toBe(200)
    expect(await database.select().from(tables.jobs)).toHaveLength(2)
  })

  it("refuses to invite a supplier that has already joined", async () => {
    const response = await post({ action: "supplier.invite", data: { id: supplierLinkId, email: "x@example.com" } })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
  })
})

describe("the workspace website on POs", () => {
  it("lets the buyer's owner set the website with their profile, and prints it on the PO", async () => {
    const profile = { firstName: "Tess", lastName: "Tester", position: "Owner", company: "Buyer" }
    // A website typed without https:// is read as https.
    await expect(saveProfile(buyer, { ...profile, website: "ftp://buyer.example" })).rejects.toThrow(
      "onboarding.company.enterWebsite"
    )
    await saveProfile(buyer, { ...profile, website: "buyer.example" })
    const [saved] = await database
      .select()
      .from(tables.supplierProfiles)
      .where(eq(tables.supplierProfiles.orgId, buyerId))
    expect(saved).toMatchObject({ website: "https://buyer.example" })
    const { bytes } = await generatePo(orderId)
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-")

    await expect(saveProfile(supplier, { ...profile, website: "https://supplier.example" })).rejects.toThrow(
      "Only admins can change the website"
    )
    await expect(
      saveProfile({ ...buyer, role: "member" }, { ...profile, website: "https://buyer.example" })
    ).rejects.toThrow("Only admins can change the website")
  })
})

describe("draft PO edits", () => {
  beforeEach(orderConnections)
  const identity = () => {
    provider.connection.mockImplementation(async (_orgId: string, kind: string) => ({
      externalId: kind === "shopify" ? "test.myshopify.com" : "A123456789"
    }))
    provider.shopifyFor.mockResolvedValue({
      variants: async () => [
        {
          id: orderData.items[0]!.variantId,
          sku: "foil-2",
          title: "Two-pack",
          product: { title: "Foil cord" },
          inventoryItem: { id: orderData.items[0]!.inventoryItemId },
          supplierSku: { value: "B-2" },
          asin: { value: "B000000001" }
        }
      ]
    })
    provider.api.listings.mockResolvedValue(new Map([["foil-2", { asin: "B000000001", fnsku: "X000000001" }]]))
  }

  it("saves a draft's changes, with its payment terms, as its next revision", async () => {
    identity()
    const created = await createOrder(buyer, { ...orderData, paymentTerms: "Net 30" })
    expect(created.data.paymentTerms).toBe("Net 30")
    await updateDraftOrder(
      buyer,
      created.id,
      { ...orderData, reference: "PO-EDITED", paymentTerms: "30% deposit, 70% before shipment" },
      1
    )
    const [saved] = await database.select().from(tables.orders).where(eq(tables.orders.id, created.id))
    expect(saved).toMatchObject({
      revision: 2,
      data: { reference: "PO-EDITED", paymentTerms: "30% deposit, 70% before shipment" }
    })
    const revisions = await database
      .select()
      .from(tables.orderRevisions)
      .where(eq(tables.orderRevisions.orderId, created.id))
    expect(revisions.map((row) => row.reason).toSorted()).toEqual(["created", "edited"])
    // A stale revision, or a PO that's been sent, can't be edited.
    await expect(updateDraftOrder(buyer, created.id, orderData, 1)).rejects.toThrow("changed")
    await database.update(tables.orders).set({ status: "submitted" }).where(eq(tables.orders.id, created.id))
    await expect(updateDraftOrder(buyer, created.id, orderData, 2)).rejects.toThrow("Only a draft")
  })

  it("sends a PO to the buyer's own location through a forwarder stop, naming the location after the stop", async () => {
    identity()
    const address = {
      name: "Lisa Yao",
      addressLine1: "1000 Siji Road",
      addressLine2: "",
      city: "Yiwu",
      stateOrRegion: "Zhejiang",
      postalCode: "322000",
      countryCode: "CN",
      phoneNumber: "",
      email: ""
    }
    const forwarder = await createForwarder({ id: buyerId, name: "Buyer" }, { name: "Yiwu Logistics", email: "" })
    await saveForwarderAddress(buyerId, { forwarderId: forwarder.id, name: "Yiwu warehouse", address })
    const [stop] = await forwarderAddresses(buyerId)
    const [location] = await database
      .insert(tables.contacts)
      .values({ orgId: buyerId, kind: "delivery", name: "Woodinville", address: { ...address, countryCode: "US" } })
      .returning()
    const via = { forwarderId: forwarder.id, addressId: stop!.addressId }
    const created = await createOrder(buyer, {
      ...orderData,
      items: warehouseLines(orderData.items),
      deliveryId: location!.id,
      via
    })
    expect(created.data).toMatchObject({
      items: [expect.objectContaining({ receiver: "warehouse" })],
      deliveryId: location!.id,
      via
    })
    await generatePo(created.id)
    expect(vi.mocked(purchaseOrderPdf).mock.lastCall![0].shipTo).toEqual({
      name: "Yiwu Logistics, Yiwu warehouse",
      lines: ["Then to Buyer, Woodinville", "1000 Siji Road", "Yiwu, Zhejiang 322000", "CN", "Lisa Yao"]
    })
    await submitOrder(buyer, created.id, 1)
    const [sent] = await database.select().from(tables.orders).where(eq(tables.orders.id, created.id))
    expect(sent?.status).toBe("submitted")
  })
})

describe("freight forwarders", () => {
  const address = {
    name: "Lisa Yao",
    addressLine1: "1000 Siji Road",
    addressLine2: "",
    city: "Yiwu",
    stateOrRegion: "Zhejiang",
    postalCode: "322000",
    countryCode: "CN",
    phoneNumber: "",
    email: ""
  }

  it("adds a forwarder with saved addresses, invites it, and hands the addresses over when it joins", async () => {
    const forwarder = await createForwarder({ id: buyerId, name: "Buyer" }, { name: "Yiwu Logistics", email: "" })
    expect(await database.select().from(tables.jobs)).toHaveLength(0)
    await saveForwarderAddress(buyerId, { forwarderId: forwarder.id, name: "Yiwu warehouse", address })
    expect((await forwarderAddresses(buyerId)).map((row) => row.addressName)).toEqual(["Yiwu warehouse"])

    await inviteForwarder({ id: buyerId, name: "Buyer" }, forwarder.id, buyer.user.email)
    const [job] = await database.select().from(tables.jobs)
    expect(job?.payload).toMatchObject({ type: "forwarder", to: buyer.user.email })

    // Joining needs a forwarder workspace the user owns.
    const forwarderOrg = randomUUID()
    await database.insert(tables.organizations).values({ id: forwarderOrg, name: "Yiwu Logistics", kind: "forwarder" })
    await database
      .insert(tables.memberships)
      .values({ orgId: forwarderOrg, userId: buyer.user.id, email: buyer.user.email, role: "owner" })
    const [invited] = await database.select().from(tables.forwarders)
    await database
      .update(tables.forwarders)
      .set({ invitationHash: hash("forwarder-invitation-test-token") })
      .where(eq(tables.forwarders.id, invited!.id))
    await expect(acceptForwarderInvitation(buyer.user, supplierId, "forwarder-invitation-test-token")).rejects.toThrow(
      "forwarder workspace"
    )
    await acceptForwarderInvitation(buyer.user, forwarderOrg, "forwarder-invitation-test-token")

    // The forwarder now keeps the address in its own workspace, and POs ship to that one.
    const own = await database.select().from(tables.contacts).where(eq(tables.contacts.orgId, forwarderOrg))
    expect(own).toMatchObject([{ kind: "delivery", name: "Yiwu warehouse" }])
    expect(await forwarderAddresses(buyerId)).toMatchObject([
      { forwarderId: forwarder.id, joined: true, addressId: own[0]!.id }
    ])
    await expect(
      saveForwarderAddress(buyerId, { forwarderId: forwarder.id, name: "Another", address })
    ).rejects.toThrow("keeps its own addresses")
  })

  it("hands a forwarder that keeps its own addresses only the saved ones POs stop at, and moves those POs there", async () => {
    const forwarder = await createForwarder({ id: buyerId, name: "Buyer" }, { name: "Yiwu Logistics", email: "" })
    await saveForwarderAddress(buyerId, { forwarderId: forwarder.id, name: "Yiwu warehouse", address })
    await saveForwarderAddress(buyerId, {
      forwarderId: forwarder.id,
      name: "Ningbo port",
      address: { ...address, city: "Ningbo", postalCode: "315000" }
    })
    const saved = (await forwarderAddresses(buyerId)).find((row) => row.addressName === "Yiwu warehouse")!
    const data = { ...orderData, via: { forwarderId: forwarder.id, addressId: saved.addressId } }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
    const [shipment] = await database
      .insert(tables.shipments)
      .values({ orderId, orderRevision: 1, snapshot: data })
      .returning()
    const forwarderOrg = await joinForwarder(forwarder.id, [
      { name: "Main warehouse", address: { ...address, addressLine1: "1 Main Road" } }
    ])
    const own = await database.select().from(tables.contacts).where(eq(tables.contacts.orgId, forwarderOrg))
    expect(own.map((contact) => contact.name).toSorted()).toEqual(["Main warehouse", "Yiwu warehouse"])
    // The PO, its revision and its shipment stop at the forwarder's copy, one of the addresses it offers.
    const copy = own.find((contact) => contact.name === "Yiwu warehouse")!
    const via = { forwarderId: forwarder.id, addressId: copy.id }
    const [order] = await database.select().from(tables.orders).where(eq(tables.orders.id, orderId))
    const [revision] = await database
      .select()
      .from(tables.orderRevisions)
      .where(eq(tables.orderRevisions.orderId, orderId))
    const [moved] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipment!.id))
    expect([order?.data.via, revision?.data.via, moved?.snapshot?.via]).toEqual([via, via, via])
    expect((await forwarderAddresses(buyerId)).map((row) => row.addressId)).toContain(copy.id)
  })

  it("keeps forwarders to the buyer that added them", async () => {
    const forwarder = await createForwarder({ id: otherId, name: "Other" }, { name: "Elsewhere", email: "" })
    await expect(
      saveForwarderAddress(buyerId, { forwarderId: forwarder.id, name: "Warehouse", address })
    ).rejects.toThrow("removed")
    expect(await forwarderAddresses(buyerId)).toEqual([])
  })

  it("names the Amazon network the goods go on to after a forwarder stop", async () => {
    const forwarder = await createForwarder({ id: buyerId, name: "Buyer" }, { name: "Yiwu Logistics", email: "" })
    await saveForwarderAddress(buyerId, { forwarderId: forwarder.id, name: "Yiwu warehouse", address })
    const [saved] = await forwarderAddresses(buyerId)
    const via = { forwarderId: forwarder.id, addressId: saved!.addressId }
    const [cord, glove] = fbaOrder.items
    const awd = { ...cord!, receiver: "awd_us" as const }
    // The ship-to the purchase order prints for these lines.
    async function poShipTo(items: typeof fbaOrder.items) {
      const data = { ...fbaOrder, via, items }
      await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
      await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
      await generatePo(orderId)
      return vi.mocked(purchaseOrderPdf).mock.lastCall![0].shipTo
    }
    expect(await poShipTo(fbaOrder.items)).toEqual({
      name: "Yiwu Logistics, Yiwu warehouse",
      lines: ["Then to Amazon FBA", "1000 Siji Road", "Yiwu, Zhejiang 322000", "CN", "Lisa Yao"]
    })
    expect((await poShipTo([awd]))?.lines[0]).toBe("Then to Amazon AWD US")
    expect((await poShipTo([awd, glove!]))?.lines[0]).toBe("Then to Amazon FBA and AWD US")
  })
})

describe("supplier pickup addresses", () => {
  const unicId = randomUUID()
  // As the shipment page has the supplier that hasn't joined.
  const unic = { id: unicId, buyerOrgId: buyerId, supplierOrgId: null }
  const address = {
    name: "Lisa Yao",
    addressLine1: "1000 Siji Road",
    addressLine2: "",
    city: "Yiwu",
    stateOrRegion: "Zhejiang",
    postalCode: "322000",
    countryCode: "CN",
    phoneNumber: "+8613800000000",
    email: ""
  }
  const save = (data: Record<string, unknown>) =>
    action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: "supplier.address", data })
      })
    )
  const saved = () => database.select().from(tables.contacts).where(eq(tables.contacts.supplierId, unicId))

  beforeEach(async () => {
    await database.insert(tables.suppliers).values({ id: unicId, buyerOrgId: buyerId, name: "Unic" })
  })

  it("lets the buyer's owner save, edit and remove a pickup address for a supplier that hasn't joined", async () => {
    const created = await save({ supplierId: unicId, name: "Factory", address })
    const [row] = await saved()
    expect(await created.json()).toEqual({ id: row!.id })
    expect(row).toMatchObject({ orgId: buyerId, kind: "pickup", name: "Factory", address })

    // Amazon needs a phone number to schedule the pickup.
    const noPhone = await save({ supplierId: unicId, name: "Warehouse", address: { ...address, phoneNumber: "" } })
    expect(noPhone.status).toBe(400)
    expect(await noPhone.json()).toEqual({ error: expect.stringContaining("Add a pickup phone number") })

    const edited = await save({
      supplierId: unicId,
      id: row!.id,
      name: "Main factory",
      address: { ...address, city: "Jinhua" }
    })
    expect(edited.status).toBe(200)
    // The supplier's shipments offer the saved address for pickup.
    expect(await supplierPickupAddresses(unic)).toMatchObject([
      { id: row!.id, name: "Main factory", address: { ...address, city: "Jinhua" } }
    ])

    expect((await save({ supplierId: unicId, id: row!.id, remove: true })).status).toBe(200)
    expect(await saved()).toEqual([])
    expect(await supplierPickupAddresses(unic)).toEqual([])
    expect(await (await save({ supplierId: unicId, id: row!.id, remove: true })).json()).toEqual({
      error: "This address was already removed"
    })
  })

  it("keeps a supplier's pickup addresses to those who can change its buyer's partners", async () => {
    await saveSupplierAddress(buyerId, { supplierId: unicId, name: "Factory", address })
    const [row] = await saved()

    // Another buyer can't add one, or change or remove this one, even through a supplier of its own.
    const theirs = randomUUID()
    await database.insert(tables.suppliers).values({ id: theirs, buyerOrgId: otherId, name: "Unic" })
    context.actor = actor("buyer", otherId)
    expect(await (await save({ supplierId: unicId, name: "Theirs", address })).json()).toEqual({
      error: "This supplier was removed"
    })
    expect(await (await save({ supplierId: theirs, id: row!.id, name: "Theirs", address })).json()).toEqual({
      error: "This address was removed"
    })
    expect(await (await save({ supplierId: theirs, id: row!.id, remove: true })).json()).toEqual({
      error: "This address was already removed"
    })

    // Nor can a member of the buyer's workspace who can only view partners, or a supplier.
    context.actor = { ...buyer, role: "member", access: { partners: "view" } }
    const member = await save({ supplierId: unicId, id: row!.id, remove: true })
    expect(member.status).toBe(403)
    expect(await member.json()).toEqual({ error: "Ask an admin for access to Partners" })
    // The workspace's own address actions don't reach a partner's addresses either, even for its owner.
    context.actor = buyer
    const generic = (name: string, data: Record<string, unknown>) =>
      action(
        new Request("http://localhost:3000/api/action", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ action: name, data })
        })
      )
    expect((await generic("contact.delete", { id: row!.id })).status).toBe(404)
    expect((await generic("contact.update", { id: row!.id, name: "Mine", kind: "delivery", address })).status).toBe(404)
    expect(await saved()).toMatchObject([{ id: row!.id, kind: "pickup", name: "Factory" }])
    context.actor = supplier
    expect(await (await save({ supplierId: unicId, name: "Dock", address })).json()).toEqual({
      error: "Switch to a buyer workspace"
    })
    expect(await saved()).toMatchObject([{ id: row!.id, orgId: buyerId, name: "Factory", address }])

    // Once the buyer removes the supplier, its addresses can't change.
    await database.update(tables.suppliers).set({ removedAt: new Date() }).where(eq(tables.suppliers.id, unicId))
    await expect(saveSupplierAddress(buyerId, { supplierId: unicId, name: "Dock", address })).rejects.toThrow(
      "This supplier was removed"
    )
  })

  it("leaves a joined supplier's pickup addresses to the supplier", async () => {
    const response = await save({ supplierId: supplierLinkId, name: "Factory", address })
    expect(await response.json()).toEqual({ error: "Supplier keeps its own pickup addresses now that it has joined" })

    // Its shipments and its partner row show the supplier's own pickup addresses, not ones the buyer saved for it.
    await database.insert(tables.contacts).values([
      { orgId: supplierId, kind: "pickup", name: "Own dock", address },
      { orgId: buyerId, kind: "pickup", supplierId: supplierLinkId, name: "Saved before joining", address }
    ])
    await saveSupplierAddress(buyerId, { supplierId: unicId, name: "Factory", address })
    const joined = { id: supplierLinkId, buyerOrgId: buyerId, supplierOrgId: supplierId }
    expect((await supplierPickupAddresses(joined)).map((row) => row.name)).toEqual(["Own dock"])
    const partners = (await listPartners(buyerId)).flatMap((row) => (row.type === "supplier" ? [row.supplier] : []))
    expect(partners.map((row) => [row.name, row.addresses.map((contact) => contact.name)])).toEqual([
      ["Supplier", ["Own dock"]],
      ["Unic", ["Factory"]]
    ])
  })
})

describe("supplier proposals", () => {
  beforeEach(orderConnections)
  const [first] = orderData.items
  const change = (overrides: Partial<ProposalInput> = {}): ProposalInput => ({
    lines: [{ itemId: first!.id, supplierSku: "B-2", title: first!.name, pieces: 320, unitPrice: 500 }],
    paymentTerms: "Net 30",
    readyDate: "2026-12-01",
    note: "Cord went up",
    ...overrides
  })
  async function packing() {
    const [shipment] = await database
      .insert(tables.shipments)
      .values({ orderId, orderRevision: 1, snapshot: orderData })
      .returning()
    return shipment!
  }

  it("publishes approved changes as the PO's next revision with the supplier's commercial invoice", async () => {
    await reviewedImport()
    const shipment = await packing()
    await expect(proposeChanges(supplier, orderId, change(), 1)).resolves.toEqual({ approval: true })
    const [proposal] = await database.select().from(tables.orderProposals)
    const { order } = await accessibleOrder(buyer, orderId)
    expect(proposalChanges(order.data, proposal!.data)).toMatchObject({
      lines: [{ change: "changed", before: { pieces: 160 }, after: { pieces: 320, unitPrice: 500 } }],
      paymentTerms: { before: "", after: "Net 30" },
      total: { after: 160_000 }
    })
    await approveProposal(buyer, proposal!.id)
    const [saved] = await database.select().from(tables.orders).where(eq(tables.orders.id, orderId))
    expect(saved).toMatchObject({ revision: 2, data: { paymentTerms: "Net 30", readyDate: "2026-12-01" } })
    expect(saved!.data.items).toMatchObject([{ id: first!.id, pieces: 320, unitPrice: 500 }])
    const [refreshed] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipment.id))
    expect(refreshed).toMatchObject({ orderRevision: 2, status: "packing" })
    const invoices = await database
      .select()
      .from(tables.documents)
      .where(and(eq(tables.documents.orderId, orderId), eq(tables.documents.kind, "invoice")))
    expect(invoices).toMatchObject([{ orderRevision: 2, shipmentId: null, outdated: 0, uploadedBy: "system" }])
    await expect(approveProposal(buyer, proposal!.id)).rejects.toThrow("already answered")
  })

  it("keeps the PO when the buyer declines, and sets a ready date alone without approval", async () => {
    await packing()
    await proposeChanges(supplier, orderId, change(), 1)
    const [proposal] = await database.select().from(tables.orderProposals)
    // Packing waits for the buyer's answer, so the cartons match the PO it approves.
    await expect(newShipment(supplier, orderId)).rejects.toThrow("waiting for approval")
    await expect(approveProposal(supplier, proposal!.id)).rejects.toThrow("buyer workspace")
    await declineProposal(buyer, proposal!.id, "Too expensive")
    expect((await database.select().from(tables.orderProposals))[0]).toMatchObject({
      status: "declined",
      reason: "Too expensive"
    })
    await expect(proposeChanges(supplier, orderId, change(), 2)).rejects.toThrow("This purchase order has changed")
    const unchanged = {
      lines: orderData.items.map((item) => ({
        itemId: item.id,
        supplierSku: item.supplierSku,
        title: item.name,
        pieces: item.pieces,
        unitPrice: item.unitPrice
      })),
      paymentTerms: "",
      note: ""
    }
    await expect(proposeChanges(supplier, orderId, { ...unchanged, readyDate: null }, 1)).rejects.toThrow(
      "Change something"
    )
    await expect(proposeChanges(supplier, orderId, { ...unchanged, readyDate: "2026-11-15" }, 1)).resolves.toEqual({
      approval: false
    })
    const [saved] = await database.select().from(tables.orders).where(eq(tables.orders.id, orderId))
    expect(saved).toMatchObject({ revision: 1, data: { readyDate: "2026-11-15" } })
  })

  it("can't change a PO once a shipment is packed", async () => {
    const shipment = await packing()
    await database.update(tables.shipments).set({ status: "ready" }).where(eq(tables.shipments.id, shipment.id))
    await expect(proposeChanges(supplier, orderId, change(), 1)).rejects.toThrow("already packed")
  })
})

describe("supplier overview", () => {
  it("counts only the workspace's own orders and customers", async () => {
    const mine = await supplierOverview({ id: supplierId, timeZone: "UTC" }, { period: "today" })
    expect(mine.backlog).toMatchObject({ orders: 1 })
    expect(mine.kpis.orders.value).toBe(1)
    expect(mine.topCustomers).toMatchObject([{ id: supplierLinkId, orders: 1 }])
    const elsewhere = randomUUID()
    await database.insert(tables.organizations).values({ id: elsewhere, name: "Another supplier", kind: "supplier" })
    const theirs = await supplierOverview({ id: elsewhere, timeZone: "UTC" }, { period: "today" })
    expect(theirs).toMatchObject({
      backlog: { orders: 0, pieces: 0 },
      kpis: { orders: { value: 0 } },
      topCustomers: []
    })
    expect(theirs.recent).toEqual([])
  })

  it("counts the pieces a shipment carries once the supplier ships it", async () => {
    const prepared = await preparation()
    await database
      .update(tables.shipments)
      .set({ status: "ready", packing: prepared.packing })
      .where(eq(tables.shipments.id, prepared.id))
    const overview = () => supplierOverview({ id: supplierId, timeZone: "UTC" }, { period: "today" })
    expect((await overview()).kpis.shipped.value).toBe(0)
    context.actor = supplier
    const shipped = await action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: "shipment.ship", data: { id: prepared.id } })
      })
    )
    expect(shipped.status).toBe(200)
    expect((await overview()).kpis.shipped.value).toBe(160)
  })
})
