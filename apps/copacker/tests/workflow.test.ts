import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { orderInputSchema, packingSchema, buildAwdRequest } from "@repo/aisle"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { PDFDocument } from "pdf-lib"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/auth"

const provider = vi.hoisted(() => ({
  amazonFor: vi.fn<(...args: never[]) => Promise<unknown>>(),
  shopifyFor: vi.fn<(...args: never[]) => Promise<unknown>>(),
  connection: vi.fn<(...args: never[]) => Promise<unknown>>(),
  api: {
    eligibility: vi.fn<(...args: never[]) => Promise<unknown>>(),
    create: vi.fn<(...args: never[]) => Promise<unknown>>(),
    order: vi.fn<(...args: never[]) => Promise<unknown>>(),
    confirm: vi.fn<(...args: never[]) => Promise<unknown>>(),
    labels: vi.fn<(...args: never[]) => Promise<unknown>>(),
    listings: vi.fn<(...args: never[]) => Promise<unknown>>()
  }
}))
vi.mock("../src/server/connections", () => ({
  amazonFor: provider.amazonFor,
  shopifyFor: provider.shopifyFor,
  connection: provider.connection
}))
const storage = vi.hoisted(() => ({ putFile: vi.fn<(...args: never[]) => Promise<void>>() }))
vi.mock("../src/server/storage", async (original) => ({
  ...(await original<typeof import("../src/server/storage")>()),
  putFile: storage.putFile
}))
const context = vi.hoisted(() => ({ current: null as unknown, actor: null as Session | null }))
vi.mock("../src/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => context.actor
}))
vi.mock("@/db", () => ({ db: () => context.current }))
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
import { POST as upload } from "../src/app/api/documents/route"
import { accessibleOrder } from "../src/server/access"
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
  checkPacking
} from "../src/server/orders"
import { runNextJob } from "../src/server/queue"
import { hash } from "../src/server/security"
import { orderWorkflow } from "../src/server/workflow"

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
  await pg.exec(await readFile(new URL("../drizzle/0000_copacker.sql", import.meta.url), "utf8"))
})
afterAll(async () => {
  await pg.close()
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
describe("Postgres workflow and authorization", () => {
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

describe("PO product identity", () => {
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
})

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
