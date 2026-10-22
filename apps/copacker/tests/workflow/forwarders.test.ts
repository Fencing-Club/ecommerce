import { randomUUID } from "node:crypto"
import { purchaseOrderPdf } from "@repo/copacker-shipments/documents"
import { eq } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { accessibleOrder, forwarderOrder, forwarderOrders } from "../../src/server/access"
import { generatePo } from "../../src/server/documents"
import {
  acceptForwarderInvitation,
  createForwarder,
  forwarderAddresses,
  inviteForwarder,
  saveForwarderAddress
} from "../../src/server/forwarders"
import { orderLandedCosts } from "../../src/server/landed-costs"
import { receiveShipment } from "../../src/server/orders"
import { hash } from "../../src/server/security"
import { orderWorkflow } from "../../src/server/workflow"
import { database } from "../test-db"
import { signedIn } from "../test-session"
import {
  actor,
  buyer,
  buyerId,
  fbaOrder,
  joinForwarder,
  orderData,
  orderId,
  otherId,
  post,
  preparation,
  setUpWorkflowTests,
  supplier,
  supplierId
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
    signedIn.actor = supplier
    expect((await post("shipment.ship", { id })).status).toBe(200)
    expect((await post("shipment.ship", { id })).status).toBe(400)
    expect((await orderWorkflow(supplier, orderId)).shipments[0]?.next).toMatchObject({
      owner: "buyer",
      step: "receive"
    })
    signedIn.actor = buyer
    await receiveShipment(buyer, id)
    const events = await database.select().from(tables.events).where(eq(tables.events.orderId, orderId))
    expect(events.map((event) => event.messageKey)).toContain("supplierShipped")
  })

  it("ships independently of the PO invoice", async () => {
    const id = await released()
    await database.update(tables.documents).set({ outdated: 1 }).where(eq(tables.documents.kind, "invoice"))
    signedIn.actor = supplier
    expect(await (await post("shipment.ship", { id })).json()).toEqual({ ok: true })
  })

  it("has the forwarder on the way ship the goods on with its freight, carrier and tracking", async () => {
    await database.insert(tables.organizations).values({ id: forwarderOrg, name: "Yiwu Logistics", kind: "forwarder" })
    const forwarder = await createForwarder({ id: buyerId, name: "Buyer" }, { name: "Yiwu Logistics", email: "" })
    const data = { ...orderData, via: { forwarderId: forwarder.id, addressId: randomUUID() } }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    const id = await released(data)
    signedIn.actor = supplier
    expect((await post("shipment.ship", { id })).status).toBe(200)
    expect((await orderWorkflow(buyer, orderId)).shipments[0]?.next).toMatchObject({
      owner: "forwarder",
      step: "forward",
      action: "shipment.forward"
    })
    await expect(receiveShipment(buyer, id)).rejects.toThrow("forwarder hasn’t shipped")
    const forward = { id, freight: { amountMinor: 12500, currency: "USD" }, carrier: "DHL", reference: "1234567890" }
    // Until the forwarder joins, the buyer records its leg; once it has, only the forwarder does.
    signedIn.actor = forwarderActor
    expect(await (await post("shipment.forward", forward)).json()).toEqual({
      error: "This shipment isn’t yours to ship"
    })
    await database
      .update(tables.forwarders)
      .set({ forwarderOrgId: forwarderOrg })
      .where(eq(tables.forwarders.id, forwarder.id))
    signedIn.actor = buyer
    expect(await (await post("shipment.forward", forward)).json()).toEqual({
      error: "Yiwu Logistics marks this shipment shipped"
    })
    signedIn.actor = forwarderActor
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
    signedIn.actor = buyer
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
