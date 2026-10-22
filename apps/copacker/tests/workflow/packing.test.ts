import { randomUUID } from "node:crypto"
import { packingSchema } from "@repo/copacker-shipments"
import { and, eq } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { emailJob } from "../../src/server/job-email"
import { jobPayloads } from "../../src/server/job-payloads"
import { resolveLocalization, withLocalization } from "../../src/server/localization"
import {
  approveInvoice,
  checkPacking,
  correctShipment,
  newShipment,
  prepareAmazonShipment,
  reopenPacking,
  savePacking,
  submitOrder,
  submitPacking
} from "../../src/server/orders"
import { orderWorkflow } from "../../src/server/workflow"
import { type Session } from "../../src/server/workspace-session"
import { provider, storage } from "../mocks/providers"
import { database, pg } from "../test-db"
import {
  actor,
  buyer,
  buyerId,
  itemId,
  orderData,
  orderId,
  otherId,
  post,
  preparation,
  setUpWorkflowTests,
  supplier,
  supplierLinkId,
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

describe("packing and invoice approval", () => {
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
    expect((await database.select().from(tables.documents))[0]?.outdated).toBe(false)
    expect((await database.select().from(tables.jobs))[0]?.status).toBe("cancelled")
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
        .where(and(eq(tables.documents.kind, "purchase_order"), eq(tables.documents.outdated, false)))
    const filed = await currentPo()
    expect(filed).toHaveLength(1)
    storage.getFile.mockResolvedValue(new TextEncoder().encode("%PDF-"))
    await emailJob(jobPayloads.email.parse(emailed[0]!.payload), {
      key: emailed[0]!.key,
      assertOwned: async () => undefined
    })
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
    const payload = { type: "ready" as const, to: "supplier@example.com", orderId, shipmentId: second!.id }
    await emailJob(payload, { key: `ready:${second!.id}:1`, assertOwned: async () => undefined })
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
