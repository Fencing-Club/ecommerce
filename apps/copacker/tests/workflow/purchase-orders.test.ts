import { randomUUID } from "node:crypto"
import { purchaseOrderPdf } from "@repo/copacker-shipments/documents"
import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { accessibleOrder } from "../../src/server/access"
import { generatePo } from "../../src/server/documents"
import { createForwarder, forwarderAddresses, saveForwarderAddress } from "../../src/server/forwarders"
import { POST as postAction } from "../../src/server/http/api/action"
import { GET as coverageRoute } from "../../src/server/http/api/orders/summary"
import { orderLandedCosts } from "../../src/server/landed-costs"
import {
  approveInvoice,
  correctShipment,
  createOrder,
  prepareAmazonShipment,
  submitOrder,
  submitPacking,
  updateDraftOrder
} from "../../src/server/orders"
import { orderWorkflow } from "../../src/server/workflow"
import { provider } from "../mocks/providers"
import { served } from "../served"
import { database } from "../test-db"
import { signedIn } from "../test-session"
import {
  actor,
  buyer,
  buyerId,
  itemId,
  orderConnections,
  orderConnectionsAmazonOnly,
  orderData,
  orderId,
  otherId,
  preparation,
  reviewedImport,
  setUpWorkflowTests,
  supplier,
  supplierId,
  supplierLinkId,
  warehouseLines,
  withGroup
} from "./fixtures"

// The action route as Start serves it, through the HTTP boundary that answers its failures.
const action = served(postAction)

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
const getCoverage = served(coverageRoute)

describe("PO coverage and access", () => {
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
    signedIn.actor = actor("buyer", otherId)
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
    signedIn.actor = supplier
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

  it("isolates buyers and suppliers by explicit shared order", async () => {
    expect((await accessibleOrder(buyer, orderId)).order.id).toBe(orderId)
    expect((await accessibleOrder(supplier, orderId)).order.id).toBe(orderId)
    await expect(accessibleOrder(actor("buyer", otherId), orderId)).rejects.toThrow("not found")
    await expect(accessibleOrder(actor("supplier", otherId), orderId)).rejects.toThrow("not found")
    await database.update(tables.orders).set({ status: "draft" }).where(eq(tables.orders.id, orderId))
    await expect(accessibleOrder(supplier, orderId)).rejects.toThrow("not found")
  })
})

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

    signedIn.actor = supplier
    expect((await send("landedCost.create", { orderId, kind: "duty", amount: 500 })).status).toBe(403)
    expect((await send("landedCost.delete", { id })).status).toBe(403)

    signedIn.actor = actor("buyer", otherId)
    expect((await send("landedCost.delete", { id })).status).toBe(400)

    signedIn.actor = buyer
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

    signedIn.actor = actor("buyer", otherId)
    expect((await send({ orderId, message: "Not mine" })).status).not.toBe(200)
    signedIn.actor = buyer
  })

  it("keeps internal comments within the author's workspace, even for a user who belongs to both", async () => {
    const { orderEvents } = await import("../../src/server/comments")
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

  it("takes no comments on a closed PO", async () => {
    const [{ status }] = await database
      .select({ status: tables.orders.status })
      .from(tables.orders)
      .where(eq(tables.orders.id, orderId))
    await database.update(tables.orders).set({ status: "closed" }).where(eq(tables.orders.id, orderId))
    const response = await send({ orderId, message: "Too late" })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: "This purchase order is already closed" })
    const comments = await database.select().from(tables.events).where(eq(tables.events.message, "Too late"))
    expect(comments).toEqual([])
    await database.update(tables.orders).set({ status }).where(eq(tables.orders.id, orderId))
  })
})
