import { randomUUID } from "node:crypto"
import { standardProductLabels, suffocationWarningLabels } from "@repo/copacker-shipments/product-labels"
import { and, eq } from "drizzle-orm"
import { PDFDocument } from "pdf-lib"
import { describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { generatePo, storeDocument } from "../../src/server/documents"
import { GET as downloadDocument } from "../../src/server/http/api/documents/$id"
import { GET as downloadImportSource } from "../../src/server/http/api/imports/$id/source"
import { GET as downloadPo } from "../../src/server/http/api/orders/$id/po"
import { GET as downloadPacket } from "../../src/server/http/api/shipments/$id/packet"
import { amazonShipmentJob } from "../../src/server/job-amazon-shipment"
import { emailJob } from "../../src/server/job-email"
import { jobPayloads } from "../../src/server/job-payloads"
import { labelsJob } from "../../src/server/label-release"
import { releaseIssues } from "../../src/server/readiness"
import { releasedPacket, shipmentPacketPage, shipmentPacketResult } from "../../src/server/shipment-packet"
import { provider, storage } from "../mocks/providers"
import { database } from "../test-db"
import { signedIn } from "../test-session"
import {
  actor,
  amazonCartonLabels,
  buyer,
  buyerId,
  carrierLabels,
  orderData,
  orderId,
  otherId,
  post,
  preparation,
  printed,
  queuedShipment,
  reviewedImport,
  setUpWorkflowTests,
  shipmentState,
  supplier,
  supplierId,
  supplierLinkId,
  trackingNumber,
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
    signedIn.actor = supplier
    expect((await post("shipment.transport", input)).status).toBe(403)
    signedIn.actor = buyer
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
      signedIn.actor = supplier
      expect((await post("shipment.transport", input)).status).toBe(403)
      signedIn.actor = buyer
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
    await database.update(tables.documents).set({ outdated: true }).where(eq(tables.documents.kind, "carton_label"))
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
    await database.update(tables.documents).set({ outdated: false }).where(eq(tables.documents.kind, "carton_label"))
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
    await amazonShipmentJob({ shipmentId: shipment.id, revision: 1 }, { assertOwned: async () => undefined })
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
    await amazonShipmentJob({ shipmentId: shipment.id, revision: 1 }, { assertOwned: async () => undefined })
    expect(await shipmentState(shipment.id)).toMatchObject({ status: "waiting_labels" })
    const [queued] = await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "labels"))
    expect(queued).toMatchObject({ status: "pending", payload: { shipmentId: shipment.id, actor: "amazon" } })
    await labelsJob(jobPayloads.labels.parse(queued!.payload))
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
    expect(docs[0]).toMatchObject({ id: original.id, outdated: false })
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
    expect((await database.select().from(tables.documents).where(eq(tables.documents.id, doc.id)))[0]?.outdated).toBe(
      false
    )
  })
  it("marks generated POs historical when the PO revision changes during storage", async () => {
    storage.putFile.mockImplementation(async () => {
      await database.update(tables.orders).set({ revision: 2 }).where(eq(tables.orders.id, orderId))
    })
    const doc = await storeDocument(
      { orderId, kind: "purchase_order", name: "PO.pdf", orderRevision: 1, outdated: false, uploadedBy: "system" },
      new Uint8Array([1])
    )
    expect(doc.outdated).toBe(true)
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
      .where(and(eq(tables.documents.kind, "purchase_order"), eq(tables.documents.outdated, false)))
    expect(current.map((doc) => doc.id)).toEqual([second.id])
    expect(first.id).not.toBe(second.id)
  })
  it("rejects an invoice upload if the PO changes during storage, preserving the current invoice", async () => {
    const prepared = await preparation()
    signedIn.actor = supplier
    storage.putFile.mockImplementation(async () => {
      await database.update(tables.orders).set({ revision: 2 }).where(eq(tables.orders.id, orderId))
    })
    const result = await uploadPdf("invoice")
    expect(result.status).toBe(400)
    expect(await result.json()).toMatchObject({ error: "The purchase order changed during upload. Try again." })
    const docs = await database.select().from(tables.documents)
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ id: prepared.invoiceId, outdated: false })
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
    expect(current[0]).toMatchObject({ id: original!.id, outdated: false })
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
    signedIn.actor = supplier
    const result = await downloadDocument(new Request("http://localhost"), {
      params: { id: prepared.invoiceId }
    })
    expect(result.status).toBe(200)
    expect(result.headers.get("Cache-Control")).toBe("private, no-store")
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })
  it("denies unrelated document downloads before reading private storage", async () => {
    const prepared = await preparation()
    signedIn.actor = actor("buyer", otherId)
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
    signedIn.actor = supplier
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
      await database.update(tables.documents).set({ outdated: true }).where(eq(tables.documents.id, prepared.invoiceId))
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
    signedIn.actor = supplier
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
    signedIn.actor = supplier
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
    signedIn.actor = supplier
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
    signedIn.actor = actor("buyer", otherId)
    expect((await uploadCarrierLabels(prepared.id, [label], [1])).status).toBe(404)
    signedIn.actor = buyer
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
    signedIn.actor = supplier
    expect((await uploadCarrierLabels(prepared.id, [label], [1])).status).toBe(403)
    signedIn.actor = buyer
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
    signedIn.actor = supplier
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
    // One sheet of the product's labels, with its FNSKU, and no warning labels.
    expect(standardProductLabels).toHaveBeenCalledExactlyOnceWith({
      code: "X000000001",
      title: "Foil body cord (Two-pack)",
      countryOfOrigin: null
    })
    expect(suffocationWarningLabels).not.toHaveBeenCalled()
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
    await emailJob(jobPayloads.email.parse(emailed[0]!.payload), {
      key: emailed[0]!.key,
      assertOwned: async () => undefined
    })
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
    expect(dropped?.outdated).toBe(true)
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
