import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.current }))
import { acceptTeamInvitation } from "../src/server/invitations"
import {
  cancelInvitation,
  changeAccess,
  inviteColleague,
  removeColleague,
  resendInvitation,
  teamOf,
  transferOwnership
} from "../src/server/team"
import { applySchema } from "./database"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const orgId = randomUUID()
const org = { id: orgId, name: "Fencing Club", kind: "buyer" as const, timeZone: "America/Los_Angeles" }
const owner = { id: "user_owner", email: "owner@club.example" }
const s = { org, user: owner }

beforeAll(async () => {
  context.current = database
  await applySchema(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations, profiles, team_invitations, jobs CASCADE")
  await database.insert(tables.organizations).values({ id: orgId, name: org.name, kind: "buyer" })
  await database.insert(tables.memberships).values([
    { orgId, userId: owner.id, email: owner.email, role: "owner" },
    { orgId, userId: "user_sam", email: "sam@club.example", role: "member", access: { orders: "edit" } },
    { orgId, userId: "user_ada", email: "ada@club.example", role: "admin" }
  ])
  await database.insert(tables.profiles).values([
    { userId: "user_sam", firstName: "Sam", lastName: "Ortiz" },
    { userId: owner.id, firstName: "Zoe", lastName: "Park" }
  ])
})

const invitationsTo = (email: string) =>
  database.select().from(tables.teamInvitations).where(eq(tables.teamInvitations.email, email))
const membership = async (userId: string) =>
  (
    await database
      .select({ role: tables.memberships.role, access: tables.memberships.access })
      .from(tables.memberships)
      .where(and(eq(tables.memberships.orgId, orgId), eq(tables.memberships.userId, userId)))
  )[0]
const buyerPages = { prices: "view", overview: "view", orders: "edit", partners: "view" } as const

describe("the team", () => {
  it("lists the owner first, then everyone by name, with the email for anyone without a name", async () => {
    const { members } = await teamOf(org)
    expect(members.map((member) => [member.name, member.role, member.access])).toStrictEqual([
      ["Zoe Park", "owner", {}],
      ["ada@club.example", "admin", {}],
      ["Sam Ortiz", "member", { orders: "edit" }]
    ])
  })

  it("shows each invitation with its access and expiry even when emails match", async () => {
    await database.insert(tables.teamInvitations).values([
      {
        orgId,
        email: "lee@club.example",
        role: "admin",
        hash: "new",
        expiresAt: new Date("2030-10-04T19:00:00Z")
      },
      {
        orgId,
        email: "lee@club.example",
        access: { sales: "view" },
        hash: "lapsed",
        expiresAt: new Date(Date.now() - 86400000)
      }
    ])
    const { invitations } = await teamOf(org)
    expect(invitations).toStrictEqual([
      { email: "lee@club.example", role: "admin", access: {}, expires: "Oct 4", expired: false },
      {
        email: "lee@club.example",
        role: "member",
        access: { sales: "view" },
        expires: expect.any(String),
        expired: true
      }
    ])
  })
})

describe("inviting a colleague", () => {
  it("emails a link, and a second invitation replaces the first with what it gives", async () => {
    await expect(
      inviteColleague(org, { email: "Lee@Club.example", role: "member", access: { orders: "view" } })
    ).resolves.toStrictEqual({ ok: true, email: "lee@club.example" })
    const [first] = await invitationsTo("lee@club.example")
    await inviteColleague(org, { email: "lee@club.example", role: "admin" })
    const again = await invitationsTo("lee@club.example")
    expect(again).toHaveLength(1)
    expect(again[0]).toMatchObject({ role: "admin", access: {} })
    expect(again[0]!.hash).not.toBe(first!.hash)
    // Only the new link's email goes out.
    const emails = await database.select().from(tables.jobs)
    expect(emails.map((job) => [job.key, job.payload])).toStrictEqual([
      [`team:${again[0]!.id}`, expect.objectContaining({ type: "team", to: "lee@club.example", name: "Fencing Club" })]
    ])
  })

  it("keeps a member's pages to this kind of workspace, viewing the ones with nothing to edit", async () => {
    await inviteColleague(org, {
      email: "lee@club.example",
      role: "member",
      access: { prices: "edit", overview: "edit", orders: "edit", partners: "view", catalogs: "edit" }
    })
    const [invitation] = await invitationsTo("lee@club.example")
    expect(invitation).toMatchObject({ role: "member", access: buyerPages })
  })

  it("without prices, leaves out the Overview and keeps purchase orders to viewing", async () => {
    await inviteColleague(org, {
      email: "lee@club.example",
      role: "member",
      access: { overview: "view", orders: "edit", shipments: "edit" }
    })
    const [invitation] = await invitationsTo("lee@club.example")
    expect(invitation?.access).toStrictEqual({ orders: "view", shipments: "edit" })
    await expect(
      inviteColleague(org, { email: "kim@club.example", role: "member", access: { overview: "view" } })
    ).rejects.toThrow("Choose at least one page")
  })

  it("needs at least one page for a member, and never makes an owner", async () => {
    await expect(inviteColleague(org, { email: "lee@club.example", role: "member", access: {} })).rejects.toThrow(
      "Choose at least one page"
    )
    await expect(
      inviteColleague(org, { email: "lee@club.example", role: "member", access: { catalogs: "edit" } })
    ).rejects.toThrow("Choose at least one page")
    await expect(inviteColleague(org, { email: "lee@club.example", role: "owner" })).rejects.toThrow(
      "Expected 'admin' | 'member'"
    )
    await expect(invitationsTo("lee@club.example")).resolves.toHaveLength(0)
  })

  it("doesn’t invite someone already in the workspace", async () => {
    await expect(inviteColleague(org, { email: "SAM@club.example", role: "admin" })).rejects.toThrow(
      "sam@club.example is already in this workspace"
    )
  })

  it("sends an invitation again with a new link and the same access", async () => {
    await inviteColleague(org, { email: "lee@club.example", role: "member", access: { shipments: "edit" } })
    const [first] = await invitationsTo("lee@club.example")
    await resendInvitation(org, { email: "lee@club.example" })
    const [again] = await invitationsTo("lee@club.example")
    expect(again).toMatchObject({ role: "member", access: { shipments: "edit" } })
    expect(again!.hash).not.toBe(first!.hash)
    await expect(resendInvitation(org, { email: "kim@club.example" })).rejects.toThrow("already accepted or withdrawn")
  })

  it("withdraws an invitation once, with its email if it hasn’t gone out", async () => {
    await inviteColleague(org, { email: "lee@club.example", role: "admin" })
    await cancelInvitation(orgId, { email: "lee@club.example" })
    await expect(invitationsTo("lee@club.example")).resolves.toHaveLength(0)
    await expect(database.select().from(tables.jobs)).resolves.toHaveLength(0)
    await expect(cancelInvitation(orgId, { email: "lee@club.example" })).rejects.toThrow(
      "This invitation was already accepted or withdrawn"
    )
  })

  it("joins the colleague with the role and pages the invitation gives", async () => {
    await inviteColleague(org, { email: "lee@club.example", role: "member", access: buyerPages })
    const [job] = await database.select().from(tables.jobs)
    const token = String(job!.payload.invitation)
    const lee = { id: "user_lee", email: "lee@club.example", emailVerified: true }
    await expect(acceptTeamInvitation(lee, token)).resolves.toBe(orgId)
    await expect(membership("user_lee")).resolves.toStrictEqual({ role: "member", access: buyerPages })
  })
})

describe("changing a colleague’s access", () => {
  it("makes a member an admin, and an admin a member with the pages chosen", async () => {
    await changeAccess(s, { userId: "user_sam", role: "admin" })
    await expect(membership("user_sam")).resolves.toStrictEqual({ role: "admin", access: {} })
    // An admin changes another admin too.
    await changeAccess(
      { ...s, user: { ...owner, id: "user_ada" } },
      {
        userId: "user_sam",
        role: "member",
        access: { shipments: "view", restock: "edit" }
      }
    )
    await expect(membership("user_sam")).resolves.toStrictEqual({
      role: "member",
      access: { restock: "view", shipments: "view" }
    })
  })

  it("hands the workspace to a colleague, keeping the owner on as an admin", async () => {
    await transferOwnership(s, { userId: "user_sam" })
    await expect(membership("user_sam")).resolves.toStrictEqual({ role: "owner", access: {} })
    await expect(membership(owner.id)).resolves.toStrictEqual({ role: "admin", access: {} })
    const { members } = await teamOf(org)
    expect(members[0]).toMatchObject({ userId: "user_sam", role: "owner" })
  })

  it("leaves handing it over to the owner", async () => {
    await expect(
      transferOwnership({ ...s, user: { ...owner, id: "user_ada" } }, { userId: "user_sam" })
    ).rejects.toThrow("Only the owner can do this")
    await expect(transferOwnership(s, { userId: owner.id })).rejects.toThrow("You already own this workspace")
    await expect(transferOwnership(s, { userId: "user_gone" })).rejects.toThrow("They’re no longer in this workspace")
    await expect(membership(owner.id)).resolves.toMatchObject({ role: "owner" })
    await expect(membership("user_ada")).resolves.toMatchObject({ role: "admin" })
  })

  it("leaves the owner’s and your own as they are", async () => {
    await expect(
      changeAccess(
        { ...s, user: { ...owner, id: "user_ada" } },
        { userId: owner.id, role: "member", access: buyerPages }
      )
    ).rejects.toThrow("The owner’s access can’t be changed")
    await expect(changeAccess(s, { userId: owner.id, role: "admin" })).rejects.toThrow(
      "You can’t change your own access"
    )
    await expect(changeAccess(s, { userId: "user_gone", role: "admin" })).rejects.toThrow(
      "They’re no longer in this workspace"
    )
    await expect(membership(owner.id)).resolves.toStrictEqual({ role: "owner", access: {} })
  })

  it("changes what an invitation gives, keeping its link", async () => {
    await inviteColleague(org, { email: "lee@club.example", role: "admin" })
    const [before] = await invitationsTo("lee@club.example")
    await changeAccess(s, { email: "Lee@club.example", role: "member", access: { sales: "view" } })
    const [after] = await invitationsTo("lee@club.example")
    expect(after).toMatchObject({ role: "member", access: { sales: "view" }, hash: before!.hash })
    await expect(changeAccess(s, { email: "kim@club.example", role: "admin" })).rejects.toThrow(
      "already accepted or withdrawn"
    )
  })
})

describe("removing a colleague", () => {
  it("removes members and admins, but not the owner or yourself", async () => {
    await removeColleague(s, { userId: "user_sam" })
    await removeColleague(s, { userId: "user_ada" })
    const { members } = await teamOf(org)
    expect(members.map((member) => member.email)).toStrictEqual([owner.email])
    await expect(removeColleague(s, { userId: owner.id })).rejects.toThrow("You can’t remove yourself")
    await database
      .insert(tables.memberships)
      .values({ orgId, userId: "user_ada", email: "ada@club.example", role: "admin" })
    await expect(removeColleague({ ...s, user: { ...owner, id: "user_ada" } }, { userId: owner.id })).rejects.toThrow(
      "The owner can’t be removed"
    )
  })
})
