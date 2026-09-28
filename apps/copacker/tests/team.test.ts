import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.current }))
import { cancelInvitation, inviteColleague, removeColleague, teamOf } from "../src/server/team"
import { applyMigrations } from "./migrations"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const orgId = randomUUID()
const org = { id: orgId, name: "Fencing Club", timeZone: "America/Los_Angeles" }
const owner = { id: "user_owner", email: "owner@club.example" }
const s = { org, user: owner }

beforeAll(async () => {
  context.current = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations, profiles, team_invitations, jobs CASCADE")
  await database.insert(tables.organizations).values({ id: orgId, name: org.name, kind: "buyer" })
  await database.insert(tables.memberships).values([
    { orgId, userId: owner.id, email: owner.email, role: "owner" },
    { orgId, userId: "user_sam", email: "sam@club.example", role: "member" },
    { orgId, userId: "user_ada", email: "ada@club.example", role: "member" }
  ])
  await database.insert(tables.profiles).values([
    { userId: "user_sam", firstName: "Sam", lastName: "Ortiz" },
    { userId: owner.id, firstName: "Zoe", lastName: "Park" }
  ])
})

const invitationsTo = (email: string) =>
  database.select().from(tables.teamInvitations).where(eq(tables.teamInvitations.email, email))

describe("the team", () => {
  it("lists owners first, then everyone by name, with the email for anyone without a name", async () => {
    const { members } = await teamOf(org)
    expect(members.map((member) => [member.name, member.owner])).toStrictEqual([
      ["Zoe Park", true],
      ["ada@club.example", false],
      ["Sam Ortiz", false]
    ])
  })

  it("shows one invitation per email, the newest, with the day its link expires", async () => {
    const day = 86400000
    await database.insert(tables.teamInvitations).values([
      {
        orgId,
        email: "lee@club.example",
        hash: "old",
        expiresAt: new Date(Date.now() - day),
        createdAt: new Date(Date.now() - 8 * day)
      },
      { orgId, email: "lee@club.example", hash: "new", expiresAt: new Date("2030-10-04T19:00:00Z") },
      { orgId, email: "kim@club.example", hash: "lapsed", expiresAt: new Date(Date.now() - day) }
    ])
    const { invitations } = await teamOf(org)
    expect(invitations).toStrictEqual([
      { email: "lee@club.example", expires: "Oct 4", expired: false },
      { email: "kim@club.example", expires: expect.any(String), expired: true }
    ])
  })
})

describe("inviting a colleague", () => {
  it("emails a link, and a second invitation replaces the first", async () => {
    await expect(inviteColleague(org, { email: "Lee@Club.example" })).resolves.toStrictEqual({
      ok: true,
      email: "lee@club.example"
    })
    const [first] = await invitationsTo("lee@club.example")
    await inviteColleague(org, { email: "lee@club.example" })
    const again = await invitationsTo("lee@club.example")
    expect(again).toHaveLength(1)
    expect(again[0]!.hash).not.toBe(first!.hash)
    // Only the new link's email goes out.
    const emails = await database.select().from(tables.jobs)
    expect(emails.map((job) => [job.key, job.payload])).toStrictEqual([
      [`team:${again[0]!.id}`, expect.objectContaining({ type: "team", to: "lee@club.example", name: "Fencing Club" })]
    ])
  })

  it("doesn’t invite someone already in the workspace", async () => {
    await expect(inviteColleague(org, { email: "SAM@club.example" })).rejects.toThrow(
      "sam@club.example is already in this workspace"
    )
  })

  it("withdraws an invitation once, with its email if it hasn’t gone out", async () => {
    await inviteColleague(org, { email: "lee@club.example" })
    await cancelInvitation(orgId, { email: "lee@club.example" })
    await expect(invitationsTo("lee@club.example")).resolves.toHaveLength(0)
    await expect(database.select().from(tables.jobs)).resolves.toHaveLength(0)
    await expect(cancelInvitation(orgId, { email: "lee@club.example" })).rejects.toThrow(
      "This invitation was already accepted or withdrawn"
    )
  })
})

describe("removing a colleague", () => {
  it("removes members, but not the owner or yourself", async () => {
    await removeColleague(s, { userId: "user_sam" })
    const { members } = await teamOf(org)
    expect(members.map((member) => member.email)).not.toContain("sam@club.example")
    await expect(removeColleague(s, { userId: owner.id })).rejects.toThrow("You can’t remove yourself")
    await expect(removeColleague({ ...s, user: { ...owner, id: "user_ada" } }, { userId: owner.id })).rejects.toThrow(
      "Only members can be removed"
    )
  })
})
