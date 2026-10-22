import { randomUUID } from "node:crypto"
import { orderInputSchema } from "@repo/copacker-orders"
import { buildAwdRequest, packingSchema } from "@repo/copacker-shipments"
import { standardProductLabels, suffocationWarningLabels } from "@repo/copacker-shipments/product-labels"
import { eq } from "drizzle-orm"
import { PDFDocument } from "pdf-lib"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { linkExistingAwd } from "../../src/server/awd-link"
import { checkLinkedAwd } from "../../src/server/awd-packing"
import { GET as downloadOrderLabels } from "../../src/server/http/api/orders/$id/labels"
import { GET as downloadPacket } from "../../src/server/http/api/shipments/$id/packet"
import { amazonShipmentJob } from "../../src/server/job-amazon-shipment"
import { correctShipment, prepareAmazonShipment, submitOrder, submitPacking } from "../../src/server/orders"
import { nextJobDelay, runNextJob } from "../../src/server/queue"
import { orderWorkflow } from "../../src/server/workflow"
import { provider, storage } from "../mocks/providers"
import { database } from "../test-db"
import { signedIn } from "../test-session"
import {
  actor,
  amazonCartonLabels,
  buyer,
  buyerId,
  itemId,
  orderConnections,
  orderData,
  orderId,
  otherId,
  post,
  preparation,
  printed,
  queuedShipment,
  readyDate,
  retryDue,
  setUpWorkflowTests,
  shipmentState,
  supplier,
  supplierId,
  uploadCarrierLabels,
  uploadPdf
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
    await expect(
      amazonShipmentJob({ shipmentId: draft.id, revision: 2 }, { assertOwned: async () => undefined })
    ).rejects.toThrow("labels are generating")
    await expect(
      amazonShipmentJob({ shipmentId: draft.id, revision: 2 }, { assertOwned: async () => undefined })
    ).rejects.toThrow("labels are generating")
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
  // The Overview keeps restock while the latest shipment updatedAt stays the same, so every status change moves it.
  it("moves the shipment's updatedAt when the worker changes its status", async () => {
    await queuedShipment()
    const before = new Date("2026-01-01T00:00:00Z")
    await database.update(tables.shipments).set({ updatedAt: before })
    provider.api.create.mockRejectedValue(new Error("Connection lost after request sent"))
    await runNextJob()
    const [row] = await database.select().from(tables.shipments)
    expect(row?.status).toBe("needs_attention")
    expect(row!.updatedAt.getTime()).toBeGreaterThan(before.getTime())
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
      amazonShipmentJob({ shipmentId: shipment.id, revision: 1 }, { assertOwned: async () => undefined }),
      amazonShipmentJob({ shipmentId: shipment.id, revision: 1 }, { assertOwned: async () => undefined })
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
      (await database.select().from(tables.documents).where(eq(tables.documents.outdated, false))).map(
        (doc) => doc.kind
      )
    expect(await kinds()).toEqual(["purchase_order"])

    // The supplier uploads its invoice and submits the cartons.
    signedIn.actor = supplier
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
    signedIn.actor = buyer
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
    signedIn.actor = supplier
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
    expect(standardProductLabels).toHaveBeenCalledExactlyOnceWith({
      code: "X000000001",
      title: "Foil body cord (Two-pack)",
      countryOfOrigin: null
    })
    expect(suffocationWarningLabels).toHaveBeenCalledOnce()
  })
})
