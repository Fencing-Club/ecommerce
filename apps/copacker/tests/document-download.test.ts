import { eq } from "drizzle-orm"
import { PDFDocument } from "pdf-lib"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { AccessError, NotFoundError } from "../src/i18n/errors"
import { downloadDocument } from "../src/server/document-download"
import { resolveLocalization, withLocalization } from "../src/server/localization"
import type { StoredFile } from "../src/server/storage"
import { workspaceSession, type Session } from "../src/server/workspace-session"
import { orderData } from "../src/stories/fixtures/orders"
import { database, setUpTestDatabase } from "./test-db"

const context = vi.hoisted(() => ({
  readFile: vi.fn<(key: string) => Promise<StoredFile>>()
}))
vi.mock("@/db", () => import("./test-db"))
vi.mock("../src/server/storage", () => ({ readFile: context.readFile }))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const buyer = id(1),
  supplier = id(2),
  foreign = id(3),
  supplierLink = id(4),
  order = id(5),
  shipment = id(6),
  document = id(7)
const user = { id: "document-test", email: "test@example.invalid", emailVerified: true }
const bytes = new TextEncoder().encode("%PDF-1.7\nprivate bytes")
let session: Session
const cancelled = vi.fn<() => void>()
function storedFile(): StoredFile {
  return {
    body: new ReadableStream(
      {
        pull(controller) {
          controller.enqueue(bytes)
          controller.close()
        },
        cancel: cancelled
      },
      { highWaterMark: 0 }
    ),
    size: bytes.length,
    contentType: "application/pdf"
  }
}

setUpTestDatabase({ truncate: [tables.organizations, tables.profiles] })
beforeEach(async () => {
  vi.resetAllMocks()
  context.readFile.mockImplementation(async () => storedFile())
  await database.insert(tables.organizations).values([
    { id: buyer, name: "Buyer", kind: "buyer" },
    { id: supplier, name: "Supplier", kind: "supplier" },
    { id: foreign, name: "Foreign", kind: "buyer" }
  ])
  await database.insert(tables.memberships).values({
    orgId: supplier,
    userId: user.id,
    email: user.email,
    role: "member",
    access: { shipments: "view", orders: "view", prices: "view" }
  })
  await database
    .insert(tables.suppliers)
    .values({ id: supplierLink, buyerOrgId: buyer, supplierOrgId: supplier, name: "Supplier" })
  await database.insert(tables.orders).values({
    id: order,
    buyerOrgId: buyer,
    supplierId: supplierLink,
    shopifyDomain: "test.invalid",
    status: "submitted",
    data: orderData({ supplierId: supplierLink })
  })
  await database
    .insert(tables.shipments)
    .values({ id: shipment, orderId: order, orderRevision: 1, revision: 1, status: "ready" })
  await database.insert(tables.documents).values({
    id: document,
    orderId: order,
    shipmentId: shipment,
    kind: "shipping_label",
    objectKey: "orders/test/label.pdf",
    name: "Étiquette.pdf",
    bytes: bytes.length,
    orderRevision: 1,
    shipmentRevision: 1,
    uploadedBy: "test"
  })
  session = (await workspaceSession(user, supplier))!
})

describe("private document streaming", () => {
  it("combines one label type in numeric carton order without changing page sizes", async () => {
    await database.update(tables.documents).set({ cartonId: "A10" }).where(eq(tables.documents.id, document))
    await database.insert(tables.documents).values([
      {
        id: id(8),
        orderId: order,
        shipmentId: shipment,
        kind: "shipping_label",
        cartonId: "A2",
        objectKey: "a2",
        name: "A2.pdf",
        bytes: 1,
        orderRevision: 1,
        shipmentRevision: 1,
        uploadedBy: "test"
      },
      {
        id: id(9),
        orderId: order,
        shipmentId: shipment,
        kind: "carton_label",
        cartonId: "A2",
        objectKey: "carton",
        name: "carton.pdf",
        bytes: 1,
        orderRevision: 1,
        shipmentRevision: 1,
        uploadedBy: "test"
      },
      {
        id: id(10),
        orderId: order,
        shipmentId: shipment,
        kind: "shipping_label",
        cartonId: "A1",
        objectKey: "outdated",
        name: "old.pdf",
        bytes: 1,
        orderRevision: 1,
        shipmentRevision: 1,
        uploadedBy: "test",
        outdated: 1
      }
    ])
    context.readFile.mockImplementation(async (key) => {
      const pdf = await PDFDocument.create()
      pdf.addPage(key === "a2" ? [288, 432] : [300, 500])
      const content = await pdf.save()
      return {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(content)
            controller.close()
          }
        }),
        size: content.length,
        contentType: "application/pdf"
      }
    })
    const result = await downloadDocument(session, document, undefined, true)
    expect(result.status).toBe(200)
    const combined = await PDFDocument.load(await result.arrayBuffer())
    expect(combined.getPages().map((page) => page.getSize())).toEqual([
      { width: 288, height: 432 },
      { width: 300, height: 500 }
    ])
    expect(context.readFile.mock.calls.map(([key]) => key)).toEqual(["a2", "orders/test/label.pdf"])
    expect(result.headers.get("content-disposition")).toContain("Carrier%20labels")
    await database.update(tables.shipments).set({ status: "waiting_labels" }).where(eq(tables.shipments.id, shipment))
    context.readFile.mockClear()
    expect((await downloadDocument(session, document, undefined, true)).status).toBe(409)
    expect(context.readFile).not.toHaveBeenCalled()
  })
  it("keeps Amazon's pallet labels from the supplier until the buyer releases the shipment", async () => {
    await database
      .update(tables.documents)
      .set({ kind: "pallet_label", name: "Pallet labels.pdf" })
      .where(eq(tables.documents.id, document))
    expect((await downloadDocument(session, document)).status).toBe(200)
    await database.update(tables.shipments).set({ status: "waiting_labels" }).where(eq(tables.shipments.id, shipment))
    context.readFile.mockClear()
    expect((await downloadDocument(session, document)).status).toBe(409)
    expect(context.readFile).not.toHaveBeenCalled()
  })
  it("streams an authorized file with the existing filename and security headers", async () => {
    const response = await downloadDocument(session, document)
    expect(response.status).toBe(200)
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "application/pdf",
      "content-disposition": "attachment; filename*=UTF-8''%C3%89tiquette.pdf",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox"
    })
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect(cancelled).not.toHaveBeenCalled()
  })
  it("does not read storage for another workspace", async () => {
    await expect(
      downloadDocument({ ...session, org: { ...session.org, id: foreign, kind: "buyer" } }, document)
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(context.readFile).not.toHaveBeenCalled()
  })
  it("requires the page and price grants before fetching an invoice", async () => {
    await database.update(tables.documents).set({ kind: "invoice" })
    await expect(downloadDocument({ ...session, access: { shipments: "view" } }, document)).rejects.toBeInstanceOf(
      AccessError
    )
    await expect(downloadDocument({ ...session, access: { prices: "view" } }, document)).rejects.toBeInstanceOf(
      AccessError
    )
    expect(context.readFile).not.toHaveBeenCalled()
  })
  it.each(["packing", "correction", "cancelled"] as const)("withholds labels on a %s shipment", async (status) => {
    await database.update(tables.shipments).set({ status })
    expect((await downloadDocument(session, document)).status).toBe(409)
    expect(context.readFile).not.toHaveBeenCalled()
  })
  it("withholds labels for a different shipment revision", async () => {
    await database.update(tables.shipments).set({ revision: 2 })
    expect((await downloadDocument(session, document)).status).toBe(409)
    expect(context.readFile).not.toHaveBeenCalled()
  })
  it("returns localized absence without opening storage for an outdated document", async () => {
    await database.update(tables.documents).set({ outdated: 1 })
    const config = await resolveLocalization({ preferredLocale: "ur", acceptLanguage: null })
    const response = await withLocalization(
      async () => config,
      () => downloadDocument(session, document)
    )
    expect(response.status).toBe(404)
    expect(await response.text()).toBe(config.messages.errors.documentNotFound)
    expect(context.readFile).not.toHaveBeenCalled()
  })
  it.each(["outdated", "replacement", "release"])("cancels the stream after a concurrent %s change", async (change) => {
    context.readFile.mockImplementation(async () => {
      if (change === "release") {
        await database.update(tables.shipments).set({ status: "correction" })
      } else {
        await database
          .update(tables.documents)
          .set(change === "replacement" ? { objectKey: "replacement.pdf" } : { outdated: 1 })
      }
      return storedFile()
    })
    const response = await downloadDocument(session, document)
    expect(response.status).toBe(409)
    expect(await response.text()).not.toContain("private bytes")
    expect(cancelled).toHaveBeenCalledOnce()
  })
  it("cancels when the supplier relationship is removed during storage access", async () => {
    context.readFile.mockImplementation(async () => {
      await database.update(tables.suppliers).set({ removedAt: new Date() })
      return storedFile()
    })
    await expect(downloadDocument(session, document)).rejects.toBeInstanceOf(NotFoundError)
    expect(cancelled).toHaveBeenCalledOnce()
  })
  it("cancels when membership is removed during storage access", async () => {
    context.readFile.mockImplementation(async () => {
      await database.delete(tables.memberships)
      return storedFile()
    })
    await expect(downloadDocument(session, document)).rejects.toThrow("You don’t have access to this workspace")
    expect(cancelled).toHaveBeenCalledOnce()
  })
  it.each(["page", "prices", "owner"])("cancels when the %s grant is revoked during storage access", async (grant) => {
    await database.update(tables.documents).set({ kind: "invoice" })
    if (grant === "owner") {
      session = { ...session, role: "owner" }
    }
    context.readFile.mockImplementation(async () => {
      await database
        .update(tables.memberships)
        .set({ role: "member", access: grant === "page" ? { prices: "view" } : { shipments: "view" } })
        .where(eq(tables.memberships.userId, user.id))
      return storedFile()
    })
    await expect(downloadDocument(session, document)).rejects.toBeInstanceOf(AccessError)
    expect(cancelled).toHaveBeenCalledOnce()
  })
})
