import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { accessibleOrder } from "../../src/server/access"
import {
  approveProposal,
  declineProposal,
  proposalChanges,
  type ProposalInput,
  proposeChanges
} from "../../src/server/order-proposals"
import { newShipment } from "../../src/server/orders"
import { database } from "../test-db"
import { buyer, orderConnections, orderData, orderId, reviewedImport, setUpWorkflowTests, supplier } from "./fixtures"

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
    expect(invoices).toMatchObject([{ orderRevision: 2, shipmentId: null, outdated: false, uploadedBy: "system" }])
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
