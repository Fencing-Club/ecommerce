import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { accessibleOrder } from "../../src/server/access"
import { POST as action } from "../../src/server/http/api/action"
import { acceptSupplierInvitation } from "../../src/server/invitations"
import { closeOrder } from "../../src/server/orders"
import { listPartners } from "../../src/server/partners"
import { hash } from "../../src/server/security"
import { saveSupplierAddress, supplierPickupAddresses } from "../../src/server/supplier-addresses"
import { supplierOverview } from "../../src/server/supplier-overview"
import { syncShopifySuppliers, updateSupplier } from "../../src/server/suppliers"
import { database } from "../test-db"
import { signedIn } from "../test-session"
import {
  actor,
  buyer,
  buyerId,
  orderId,
  otherId,
  preparation,
  setUpWorkflowTests,
  supplier,
  supplierId,
  supplierLinkId
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

describe("supplier invitations", () => {
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
})

describe("delivery and pickup addresses", () => {
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
    signedIn.actor = supplier
    expect((await save("pickup")).status).toBe(200)
    expect(await (await save("delivery")).json()).toMatchObject({
      error: expect.stringContaining("pickup addresses only")
    })
    const saved = await database.select({ kind: tables.contacts.kind }).from(tables.contacts)
    expect(saved.map((contact) => contact.kind).toSorted()).toEqual(["delivery", "pickup"])
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
    signedIn.actor = actor("buyer", otherId)
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
    signedIn.actor = { ...buyer, role: "member", access: { partners: "view" } }
    const member = await save({ supplierId: unicId, id: row!.id, remove: true })
    expect(member.status).toBe(403)
    expect(await member.json()).toEqual({ error: "Ask an admin for access to Partners" })
    // The workspace's own address actions don't reach a partner's addresses either, even for its owner.
    signedIn.actor = buyer
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
    signedIn.actor = supplier
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
    signedIn.actor = supplier
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
