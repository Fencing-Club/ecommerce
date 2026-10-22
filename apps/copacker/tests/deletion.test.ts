vi.mock("@tanstack/react-start/server", () => ({
  deleteCookie: (name: string) => {
    remote.cookies.delete(name)
  }
}))
vi.mock("../src/server/auth-session", () => ({
  clearAuthentication: async () => {
    remote.cookies.delete("wos-session")
  }
}))
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { orderInputSchema } from "@repo/copacker-orders"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.current }))
const remote = vi.hoisted(() => ({
  deleteUser: vi.fn<(userId: string) => Promise<void>>(),
  deleteOrganization: vi.fn<(id: string) => Promise<void>>(),
  deleteFile: vi.fn<(key: string) => Promise<void>>(),
  disconnect: vi.fn<(orgId: string, provider: string) => Promise<unknown>>(),
  cookies: new Map<string, string>()
}))
vi.mock("../src/server/workos", () => ({
  workos: () => ({
    userManagement: { deleteUser: remote.deleteUser },
    organizations: { deleteOrganization: remote.deleteOrganization }
  })
}))
vi.mock("../src/server/storage", () => ({ deleteFile: remote.deleteFile }))
vi.mock("../src/server/connections", () => ({ disconnect: remote.disconnect }))

import { deleteAccount, deleteWorkspace, ownedWorkspaces } from "../src/server/deletion"
import { applySchema } from "./database"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const buyerId = randomUUID(),
  supplierId = randomUUID(),
  otherBuyerId = randomUUID()
const owner = { id: "user_zoe", email: "zoe@club.example" }
const colleague = { id: "user_sam", email: "sam@club.example" }
const buyer = { id: buyerId, name: "Fencing Club", workosId: "org_club" }
const supplierLinkId = randomUUID(),
  otherLinkId = randomUUID(),
  orderId = randomUUID(),
  otherOrderId = randomUUID(),
  shipmentId = randomUUID(),
  catalogId = randomUUID()
const data = orderInputSchema.parse({
  supplierId: supplierLinkId,
  reference: "PO-1",
  currency: "USD",
  items: [
    {
      id: randomUUID(),
      variantId: "gid://shopify/ProductVariant/1",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      name: "Foil blade",
      variant: "Maraging",
      buyerSku: "foil",
      supplierSku: "F-1",
      asin: "B000000001",
      fnsku: "X000000001",
      pieces: 10,
      piecesPerSet: 1,
      unitPrice: 500,
      receiver: "awd_us"
    }
  ]
})

beforeAll(async () => {
  context.current = database
  await applySchema(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  vi.resetAllMocks()
  remote.deleteUser.mockResolvedValue()
  remote.deleteOrganization.mockResolvedValue()
  remote.deleteFile.mockResolvedValue()
  remote.disconnect.mockResolvedValue({ revoked: true })
  remote.cookies = new Map([
    ["wos-session", "session"],
    ["copacker-workspace", buyerId]
  ])
  await pg.exec("TRUNCATE organizations, profiles, jobs CASCADE")
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Fencing Club", kind: "buyer", workosId: "org_club" },
    { id: supplierId, name: "Unic", kind: "supplier" },
    { id: otherBuyerId, name: "Epee Club", kind: "buyer" }
  ])
  await database.insert(tables.memberships).values([
    { orgId: buyerId, userId: owner.id, email: owner.email, role: "owner" },
    { orgId: buyerId, userId: colleague.id, email: colleague.email, role: "member", access: { orders: "view" } },
    { orgId: supplierId, userId: owner.id, email: owner.email, role: "owner" },
    { orgId: otherBuyerId, userId: "user_kim", email: "kim@epee.example", role: "owner" }
  ])
  await database.insert(tables.profiles).values({ userId: owner.id, firstName: "Zoe", lastName: "Park" })
  await database.insert(tables.catalogs).values({ id: catalogId, supplierOrgId: supplierId, title: "Wholesale" })
  // Both buyers work with Unic's workspace; Epee Club sees it through its catalog.
  await database.insert(tables.suppliers).values([
    { id: supplierLinkId, buyerOrgId: buyerId, supplierOrgId: supplierId, name: "Unic" },
    { id: otherLinkId, buyerOrgId: otherBuyerId, supplierOrgId: supplierId, name: "Unic", catalogId }
  ])
  await database.insert(tables.orders).values([
    { id: orderId, buyerOrgId: buyerId, supplierId: supplierLinkId, shopifyDomain: "club.myshopify.com", data },
    { id: otherOrderId, buyerOrgId: otherBuyerId, supplierId: otherLinkId, shopifyDomain: "epee.myshopify.com", data }
  ])
  await database.insert(tables.shipments).values({ id: shipmentId, orderId, orderRevision: 1 })
  await database.insert(tables.documents).values([
    {
      orderId,
      shipmentId,
      kind: "invoice",
      objectKey: "documents/club-invoice.pdf",
      uploadedBy: owner.id,
      name: "Invoice.pdf",
      bytes: 10,
      orderRevision: 1
    },
    {
      orderId: otherOrderId,
      kind: "purchase_order",
      objectKey: "documents/epee-po.pdf",
      name: "PO.pdf",
      bytes: 10,
      orderRevision: 1,
      uploadedBy: "user_kim"
    }
  ])
  await database.insert(tables.events).values({ orderId, actor: owner.id, message: "Created" })
  await database.insert(tables.connections).values({
    orgId: buyerId,
    provider: "shopify",
    externalId: "club.myshopify.com",
    encryptedToken: "token"
  })
  await database.insert(tables.teamInvitations).values({
    orgId: buyerId,
    email: "lee@club.example",
    hash: "invitation",
    expiresAt: new Date(Date.now() + 86400000)
  })
  const [invitation] = await database.select().from(tables.teamInvitations)
  await database.insert(tables.jobs).values([
    { key: `team:${invitation!.id}`, kind: "email", payload: { type: "team", to: "lee@club.example" } },
    { key: `po:${orderId}:1`, kind: "email", payload: { type: "po", orderId } },
    { key: `sales:${buyerId}:shopify:1`, kind: "sales", payload: { orgId: buyerId } },
    { key: `po:${otherOrderId}:1`, kind: "email", payload: { type: "po", orderId: otherOrderId } }
  ])
})

// How many rows a table has.
const count = async (table: string) =>
  Number((await pg.query<{ count: string }>(`select count(*) from ${table}`)).rows[0]!.count)

describe("deleting a workspace", () => {
  it("deletes a buyer's purchase orders, team, connections and jobs, and leaves other buyers' alone", async () => {
    await expect(deleteWorkspace(buyer, { name: "fencing club" })).resolves.toStrictEqual({ redirect: "/" })
    const orgs = await database.select({ id: tables.organizations.id }).from(tables.organizations)
    expect(orgs.map((org) => org.id).toSorted()).toStrictEqual([supplierId, otherBuyerId].toSorted())
    expect((await database.select().from(tables.orders)).map((order) => order.id)).toStrictEqual([otherOrderId])
    expect(await count("shipments")).toBe(0)
    expect(await count("events")).toBe(0)
    expect(await count("team_invitations")).toBe(0)
    expect(await count("connections")).toBe(0)
    expect((await database.select().from(tables.memberships)).map((row) => row.orgId).toSorted()).toStrictEqual(
      [supplierId, otherBuyerId].toSorted()
    )
    expect((await database.select().from(tables.suppliers)).map((row) => row.id)).toStrictEqual([otherLinkId])
    expect((await database.select().from(tables.jobs)).map((job) => job.key)).toStrictEqual([`po:${otherOrderId}:1`])
    expect(remote.disconnect).toHaveBeenCalledWith(buyerId, "shopify")
    expect(remote.deleteFile).toHaveBeenCalledWith("documents/club-invoice.pdf")
    expect(remote.deleteFile).not.toHaveBeenCalledWith("documents/epee-po.pdf")
    expect(remote.deleteOrganization).toHaveBeenCalledWith("org_club")
  })

  it("unlinks a supplier from its buyers, who keep their purchase orders from it", async () => {
    await deleteWorkspace({ id: supplierId, name: "Unic", workosId: null }, { name: "Unic" })
    const links = await database.select().from(tables.suppliers)
    expect(links.map((row) => [row.id, row.supplierOrgId, row.catalogId]).toSorted()).toStrictEqual(
      [
        [supplierLinkId, null, null],
        [otherLinkId, null, null]
      ].toSorted()
    )
    expect(await count("orders")).toBe(2)
    expect(await count("catalogs")).toBe(0)
    expect(remote.deleteOrganization).not.toHaveBeenCalled()
  })

  it("asks for the workspace's name first", async () => {
    await expect(deleteWorkspace(buyer, { name: "Fencing" })).rejects.toThrow("Enter the workspace’s name to confirm")
    expect(await count("orders")).toBe(2)
  })
})

describe("deleting an account", () => {
  it("waits until the workspaces others use have a new owner", async () => {
    await expect(ownedWorkspaces(owner.id)).resolves.toStrictEqual({
      handOver: [{ id: buyerId, name: "Fencing Club" }],
      closing: [{ id: supplierId, name: "Unic" }]
    })
    await expect(deleteAccount(owner, { email: owner.email })).rejects.toThrow(
      "Transfer ownership of Fencing Club first"
    )
    expect(remote.deleteUser).not.toHaveBeenCalled()
  })

  it("deletes the person and closes the workspaces only they use, keeping their records", async () => {
    await database.update(tables.memberships).set({ role: "owner" }).where(eq(tables.memberships.userId, colleague.id))
    await database
      .update(tables.memberships)
      .set({ role: "admin" })
      .where(and(eq(tables.memberships.orgId, buyerId), eq(tables.memberships.userId, owner.id)))
    await expect(deleteAccount(owner, { email: "ZOE@club.example" })).resolves.toStrictEqual({ redirect: "/" })
    expect(remote.deleteUser).toHaveBeenCalledWith(owner.id)
    expect(
      await database.select().from(tables.memberships).where(eq(tables.memberships.userId, owner.id))
    ).toHaveLength(0)
    expect(await count("profiles")).toBe(0)
    // Unic's workspace stays, unlinked from its buyers, whose purchase orders from it are untouched.
    expect(await count("organizations")).toBe(3)
    expect((await database.select().from(tables.suppliers)).every((row) => row.supplierOrgId === null)).toBe(true)
    expect(await count("orders")).toBe(2)
    // The browser is signed out.
    expect([...remote.cookies.keys()]).toStrictEqual([])
  })

  it("asks for the email first", async () => {
    await expect(deleteAccount(colleague, { email: "someone@club.example" })).rejects.toThrow(
      "Enter your email to confirm"
    )
  })
})
