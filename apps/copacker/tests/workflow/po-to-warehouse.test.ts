import { randomUUID } from "node:crypto"
import { addressSchema, orderInputSchema } from "@repo/copacker-orders"
import { packingSchema } from "@repo/copacker-shipments"
import { standardProductLabels, suffocationWarningLabels } from "@repo/copacker-shipments/product-labels"
import { eq } from "drizzle-orm"
import { PDFDocument } from "pdf-lib"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { GET as downloadPacket } from "../../src/server/http/api/shipments/$id/packet"
import { closeOrder, receiveShipment, submitOrder, submitPacking } from "../../src/server/orders"
import { orderWorkflow } from "../../src/server/workflow"
import { provider, storage } from "../mocks/providers"
import { database } from "../test-db"
import { signedIn } from "../test-session"
import {
  buyer,
  buyerId,
  itemId,
  orderData,
  orderId,
  readyDate,
  setUpWorkflowTests,
  supplier,
  supplierId,
  uploadPdf,
  warehouseLines
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
    signedIn.actor = supplier
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
    // The product's labels, with its SKU as it has no FNSKU, and the suffocation warning labels. There are no carton or
    // shipping labels.
    expect(standardProductLabels).toHaveBeenCalledExactlyOnceWith({
      code: "foil-2",
      title: "Foil body cord (Two-pack)",
      countryOfOrigin: null
    })
    expect(suffocationWarningLabels).toHaveBeenCalledOnce()
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
    // The uploaded label as it is, and the suffocation warning labels.
    expect(storage.getFile).toHaveBeenCalledExactlyOnceWith("barcodes/foil-2.pdf")
    expect(standardProductLabels).not.toHaveBeenCalled()
    expect(suffocationWarningLabels).toHaveBeenCalledOnce()
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
