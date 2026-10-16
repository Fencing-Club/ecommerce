vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) => jar.get(name),
  setCookie: (name: string, value: string) => {
    jar.set(name, value)
  },
  deleteCookie: (name: string) => {
    jar.delete(name)
  }
}))
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown }))
const jar = vi.hoisted(() => new Map<string, string>())
vi.mock("@/db", () => ({ db: () => context.current }))

const remote = vi.hoisted(() => ({
  createOrganization: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(),
  createOrganizationMembership: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateUser: vi.fn<(...args: unknown[]) => Promise<unknown>>()
}))
vi.mock("../src/server/workos", () => ({
  workos: () => ({
    organizations: { createOrganization: remote.createOrganization },
    userManagement: {
      createOrganizationMembership: remote.createOrganizationMembership,
      updateUser: remote.updateUser
    }
  }),
  workosClientId: () => "client_test"
}))
import { findInvitation } from "../src/server/invitations"
import { joinWorkspace, setUpWorkspace } from "../src/server/onboarding"
import { hash } from "../src/server/security"
import { applyMigrations } from "./migrations"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const buyerId = randomUUID()
const person = { firstName: "Wei", lastName: "Chen", position: "Sales manager" }
const user = { id: "user_wei", email: "wei@supplier.example", emailVerified: true }
const address = {
  name: "Wei Chen",
  phoneNumber: "+86 188 6161 3263",
  email: "",
  addressLine1: "88 Longgang Avenue",
  addressLine2: "",
  city: "Shenzhen",
  stateOrRegion: "Guangdong",
  postalCode: "518000",
  countryCode: "cn"
}
const week = () => new Date(Date.now() + 7 * 86400000)

beforeAll(async () => {
  context.current = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  vi.resetAllMocks()
  remote.createOrganization.mockResolvedValue({ id: `org_${randomUUID()}` })
  jar.clear()
  await pg.exec("TRUNCATE organizations, profiles, team_invitations CASCADE")
  await database.insert(tables.organizations).values({ id: buyerId, name: "Fencing Club", kind: "buyer" })
})

async function workspacesOf(userId: string) {
  return database
    .select({ org: tables.organizations, member: tables.memberships })
    .from(tables.memberships)
    .innerJoin(tables.organizations, eq(tables.organizations.id, tables.memberships.orgId))
    .where(eq(tables.memberships.userId, userId))
}

describe("setting up a workspace", () => {
  it("makes the workspace, its owner, its details, the person's profile and the first address at once", async () => {
    await expect(
      setUpWorkspace(user, {
        person: { firstName: "Tess", lastName: "Tester", position: "Owner" },
        kind: "buyer",
        company: { name: "Northwind Outfitters", website: "northwind.example", phone: "" },
        address: { name: "Warehouse", address: { ...address, countryCode: "US" } },
        invitation: null
      })
    ).resolves.toEqual({ redirect: "/" })
    const [created] = await workspacesOf(user.id)
    expect(created).toMatchObject({
      org: { name: "Northwind Outfitters", kind: "buyer", workosId: expect.stringMatching(/^org_/) },
      member: { role: "owner", email: user.email }
    })
    // The new workspace opens next.
    expect(jar.get("copacker-workspace")).toBe(created!.org.id)
    const [details] = await database
      .select()
      .from(tables.supplierProfiles)
      .where(eq(tables.supplierProfiles.orgId, created!.org.id))
    // A buyer's website prints on its purchase orders; nobody sees its contact details.
    expect(details).toMatchObject({ website: "https://northwind.example", contactName: null, contactEmail: null })
    expect(
      await database.select().from(tables.contacts).where(eq(tables.contacts.orgId, created!.org.id))
    ).toMatchObject([{ kind: "delivery", name: "Warehouse", address: { city: "Shenzhen", countryCode: "US" } }])
    const [profile] = await database.select().from(tables.profiles).where(eq(tables.profiles.userId, user.id))
    expect(profile).toMatchObject({
      firstName: "Tess",
      lastName: "Tester",
      position: "Owner",
      company: "Northwind Outfitters"
    })
    expect(remote.createOrganizationMembership).toHaveBeenCalledWith({
      userId: user.id,
      organizationId: created!.org.workosId
    })
    expect(remote.updateUser).toHaveBeenCalledWith({ userId: user.id, firstName: "Tess", lastName: "Tester" })
  })

  it("joins the buyer that invited a supplier, which keeps the buyer's details it didn't give", async () => {
    const [invited] = await database
      .insert(tables.suppliers)
      .values({
        buyerOrgId: buyerId,
        name: "Harbor Metalworks",
        email: user.email,
        invitationHash: hash("supplier-invitation-token-000"),
        expiresAt: week(),
        website: "https://harbor.example"
      })
      .returning()
    await setUpWorkspace(user, {
      person,
      kind: "buyer",
      company: { name: "Harbor Metalworks", website: "", phone: "+86 188 6161 3263" },
      address: { name: "Factory", address },
      invitation: { kind: "supplier", token: "supplier-invitation-token-000" }
    })
    const [created] = await workspacesOf(user.id)
    // The invitation decides what the workspace is.
    expect(created!.org.kind).toBe("supplier")
    const [linked] = await database.select().from(tables.suppliers).where(eq(tables.suppliers.id, invited!.id))
    expect(linked).toMatchObject({ supplierOrgId: created!.org.id, invitationHash: null, expiresAt: null })
    const [details] = await database
      .select()
      .from(tables.supplierProfiles)
      .where(eq(tables.supplierProfiles.orgId, created!.org.id))
    expect(details).toMatchObject({
      website: "https://harbor.example",
      phoneNumber: "+86 188 6161 3263",
      contactName: "Wei Chen",
      contactEmail: user.email
    })
    expect(
      await database.select().from(tables.contacts).where(eq(tables.contacts.orgId, created!.org.id))
    ).toMatchObject([{ kind: "pickup", name: "Factory", address: { countryCode: "CN" } }])
    await expect(findInvitation("supplier", "supplier-invitation-token-000")).resolves.toBeNull()
  })

  it("turns down an invitation for another email before making anything", async () => {
    await database.insert(tables.suppliers).values({
      buyerOrgId: buyerId,
      name: "Harbor Metalworks",
      email: "someone-else@supplier.example",
      invitationHash: hash("supplier-invitation-token-001"),
      expiresAt: week()
    })
    await expect(
      setUpWorkspace(user, {
        person,
        kind: "supplier",
        company: { name: "Harbor Metalworks", website: "", phone: "" },
        address: null,
        invitation: { kind: "supplier", token: "supplier-invitation-token-001" }
      })
    ).rejects.toThrow("different email")
    await expect(
      setUpWorkspace(
        { ...user, emailVerified: false },
        {
          person,
          kind: "supplier",
          company: { name: "Harbor Metalworks", website: "", phone: "" },
          address: null,
          invitation: { kind: "supplier", token: "supplier-invitation-token-001" }
        }
      )
    ).rejects.toThrow("Verify your email")
    expect(remote.createOrganization).not.toHaveBeenCalled()
    expect(await workspacesOf(user.id)).toEqual([])
  })
})

describe("joining by invitation", () => {
  it("adds a colleague to the workspace that invited them, with their profile", async () => {
    await database.insert(tables.teamInvitations).values({
      orgId: buyerId,
      email: user.email,
      hash: hash("team-invitation-token-00000"),
      expiresAt: week()
    })
    await expect(joinWorkspace(user, { kind: "team", token: "team-invitation-token-00000", person })).resolves.toEqual({
      redirect: "/"
    })
    expect(await workspacesOf(user.id)).toMatchObject([{ org: { id: buyerId }, member: { role: "member" } }])
    expect(jar.get("copacker-workspace")).toBe(buyerId)
    const [profile] = await database.select().from(tables.profiles).where(eq(tables.profiles.userId, user.id))
    expect(profile).toMatchObject({ firstName: "Wei", company: "Fencing Club" })
    // The invitation is used up.
    await expect(joinWorkspace(user, { kind: "team", token: "team-invitation-token-00000" })).rejects.toThrow(
      "Invitation expired"
    )
  })

  it("links a supplier workspace the person already owns, and nobody else's", async () => {
    const owned = randomUUID()
    await database.insert(tables.organizations).values({ id: owned, name: "Harbor Metalworks", kind: "supplier" })
    await database
      .insert(tables.memberships)
      .values({ orgId: owned, userId: user.id, email: user.email, role: "owner" })
    const [invited] = await database
      .insert(tables.suppliers)
      .values({
        buyerOrgId: buyerId,
        name: "Harbor",
        email: user.email,
        invitationHash: hash("supplier-invitation-token-002"),
        expiresAt: week()
      })
      .returning()
    await expect(
      joinWorkspace(user, { kind: "supplier", token: "supplier-invitation-token-002", orgId: buyerId })
    ).rejects.toThrow("supplier workspace")
    await joinWorkspace(user, { kind: "supplier", token: "supplier-invitation-token-002", orgId: owned })
    const [linked] = await database.select().from(tables.suppliers).where(eq(tables.suppliers.id, invited!.id))
    expect(linked?.supplierOrgId).toBe(owned)
    expect(jar.get("copacker-workspace")).toBe(owned)
  })
})

describe("finding an invitation from its link", () => {
  it("says who sent it and brings a forwarder the addresses its buyer saved", async () => {
    const [forwarder] = await database
      .insert(tables.forwarders)
      .values({
        buyerOrgId: buyerId,
        name: "Pacific Link",
        email: "ops@pacific.example",
        invitationHash: hash("forwarder-invitation-token-0"),
        expiresAt: week()
      })
      .returning()
    await database.insert(tables.contacts).values({
      orgId: buyerId,
      kind: "forwarder",
      forwarderId: forwarder!.id,
      name: "Yantian warehouse",
      address: { ...address, countryCode: "CN" }
    })
    await expect(findInvitation("forwarder", "forwarder-invitation-token-0")).resolves.toMatchObject({
      kind: "forwarder",
      email: "ops@pacific.example",
      from: "Fencing Club",
      company: "Pacific Link",
      expired: false,
      addresses: [{ name: "Yantian warehouse", address: { city: "Shenzhen" } }]
    })
    await expect(findInvitation("supplier", "forwarder-invitation-token-0")).resolves.toBeNull()
  })

  it("marks an expired invitation, and doesn't find a replaced one", async () => {
    await database.insert(tables.teamInvitations).values({
      orgId: buyerId,
      email: user.email,
      hash: hash("team-invitation-token-00001"),
      expiresAt: new Date(Date.now() - 1000)
    })
    await expect(findInvitation("team", "team-invitation-token-00001")).resolves.toMatchObject({
      from: "Fencing Club",
      expired: true
    })
    await expect(findInvitation("team", "team-invitation-token-99999")).resolves.toBeNull()
  })
})
