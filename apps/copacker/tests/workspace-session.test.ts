import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { AccessError, LocalizedError } from "../src/i18n/errors"
import { requireAccess, requireAdmin } from "../src/server/authorization"
import { overviewDestination, portalSession, portalShell } from "../src/server/portal-session"
import { profileFor, requireMembership, workspaceSession } from "../src/server/workspace-session"
import { applySchema } from "./database"

const context: { current: unknown } = vi.hoisted(() => ({ current: null }))
vi.mock("@/db", () => ({ db: () => context.current }))

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const first = "00000000-0000-4000-8000-000000000001"
const second = "00000000-0000-4000-8000-000000000002"
const foreign = "00000000-0000-4000-8000-000000000003"
const user = {
  id: "user_member",
  email: "member@example.invalid",
  emailVerified: true,
  firstName: "Saved",
  lastName: "Member"
}

beforeAll(async () => {
  context.current = database
  await applySchema(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations, profiles CASCADE")
  await database.insert(tables.organizations).values([
    { id: second, name: "Supplier", kind: "supplier", createdAt: new Date("2026-01-02"), workosId: "org_private" },
    { id: first, name: "Buyer", kind: "buyer", createdAt: new Date("2026-01-01"), restockLeadTimeDays: 30 },
    { id: foreign, name: "Someone else's workspace", kind: "buyer" }
  ])
  await database.insert(tables.memberships).values([
    { orgId: first, userId: user.id, email: user.email, role: "owner" },
    { orgId: second, userId: user.id, email: user.email, role: "member", access: { orders: "view" } },
    { orgId: foreign, userId: "user_other", email: "other@example.invalid", role: "owner" }
  ])
})

describe("request workspace resolution", () => {
  it("uses the selected membership's permissions and limits the switcher to presentation fields", async () => {
    const current = await workspaceSession(user, second)
    expect(current).toMatchObject({
      org: { id: second, kind: "supplier" },
      user: { id: user.id, email: user.email, emailVerified: true, name: "Saved Member" },
      role: "member",
      access: { orders: "view" }
    })
    expect(current?.workspaces).toEqual([
      { id: first, name: "Buyer", kind: "buyer" },
      { id: second, name: "Supplier", kind: "supplier" }
    ])
    expect(Object.keys(current!.user).toSorted()).toEqual(["email", "emailVerified", "id", "name"])
    expect(() => requireAccess(current!, "orders")).not.toThrow()
    expect(() => requireAccess(current!, "orders", "edit")).toThrow(AccessError)
    expect(() => requireAccess(current!, "prices")).toThrow(AccessError)
    expect(() => requireAdmin(current!)).toThrow(AccessError)
  })

  it.each([undefined, "malformed", foreign])("requires a fresh workspace selection for %s", async (active) => {
    const current = await workspaceSession(user, active)
    expect(current).toBeNull()
  })

  it("reads permission changes on the next operation", async () => {
    const before = await workspaceSession(user, second)
    expect(() => requireAccess(before!, "orders", "edit")).toThrow(AccessError)
    await database
      .update(tables.memberships)
      .set({ access: { orders: "edit", prices: "view" } })
      .where(and(eq(tables.memberships.orgId, second), eq(tables.memberships.userId, user.id)))
    const after = await workspaceSession(user, second)
    expect(() => requireAccess(after!, "orders", "edit")).not.toThrow()
    expect(() => requireAccess(after!, "prices")).not.toThrow()
  })

  it("drops revoked membership rather than trusting the workspace cookie", async () => {
    expect((await workspaceSession(user, second))?.org.id).toBe(second)
    await database
      .delete(tables.memberships)
      .where(and(eq(tables.memberships.orgId, second), eq(tables.memberships.userId, user.id)))
    const after = await workspaceSession(user, second)
    expect(after).toBeNull()
    await expect(requireMembership(user.id, second)).rejects.toThrow(LocalizedError)
  })

  it("returns no session when all memberships are gone, without creating a profile", async () => {
    await database.delete(tables.memberships).where(eq(tables.memberships.userId, user.id))
    expect(await workspaceSession(user, first)).toBeNull()
    expect(await database.select().from(tables.profiles)).toEqual([])
  })

  it("keeps overlapping callers in their own memberships", async () => {
    const [member, other] = await Promise.all([
      workspaceSession(user, first),
      workspaceSession({ id: "user_other", email: "other@example.invalid", emailVerified: true }, foreign)
    ])
    expect(member?.workspaces.map(({ id }) => id)).toEqual([first, second])
    expect(other?.workspaces).toEqual([{ id: foreign, name: "Someone else's workspace", kind: "buyer" }])
  })

  it.each([foreign, "not-a-uuid"])("rejects a direct membership request for %s", async (id) => {
    await expect(requireMembership(user.id, id)).rejects.toThrow(LocalizedError)
  })
})

describe("portal entry and shell data", () => {
  it("preserves a safe return path for anonymous users and rejects external destinations", async () => {
    expect(await portalSession(null, first, "/overview?channel=amazon")).toEqual({
      redirect: "/login?next=%2Foverview%3Fchannel%3Damazon"
    })
    expect(await portalSession(null, first, "//other.example/steal")).toEqual({ redirect: "/login?next=%2F" })
  })
  it("requires a complete profile before portal data can load", async () => {
    expect(await portalSession(user, first, "/overview?period=today")).toEqual({
      redirect: "/onboarding?next=%2Foverview%3Fperiod%3Dtoday"
    })
    await database
      .update(tables.profiles)
      .set({ position: "Operations", company: "Buyer" })
      .where(eq(tables.profiles.userId, user.id))
    const result = await portalSession(user, first, "/overview")
    expect(result.session?.org.id).toBe(first)
    const shell = portalShell(result.session!, "false")
    expect(shell.defaultOpen).toBe(false)
    expect(Object.keys(shell).toSorted()).toEqual([
      "active",
      "defaultOpen",
      "email",
      "kind",
      "name",
      "permissions",
      "userName",
      "workspaces"
    ])
    expect(JSON.stringify(shell)).not.toContain("org_private")
    expect(overviewDestination(result.session!)).toBeNull()
    const restricted = await workspaceSession(user, second)
    expect(overviewDestination(restricted!)).toBe("/orders")
  })
  it.each([undefined, "malformed", foreign])("recovers unavailable portal selections (%s)", async (active) => {
    expect(await portalSession(user, active, "/orders/old-order")).toEqual({
      redirect: active ? "/workspaces?unavailable=1" : "/workspaces"
    })
  })
  it("requires onboarding after every membership is revoked", async () => {
    await database.delete(tables.memberships).where(eq(tables.memberships.userId, user.id))
    expect(await portalSession(user, first, "/overview")).toEqual({ redirect: "/onboarding" })
  })
})

describe("profile initialization", () => {
  it("preserves a saved name and reads the winner of concurrent profile creation", async () => {
    const [one, two] = await Promise.all([
      profileFor({ ...user, firstName: "One", lastName: "Writer" }),
      profileFor({ ...user, firstName: "Two", lastName: "Writer" })
    ])
    const [saved] = await database.select().from(tables.profiles).where(eq(tables.profiles.userId, user.id))
    expect(one).toEqual(saved)
    expect(two).toEqual(saved)
    expect(await profileFor(user)).toEqual(saved)
  })

  it("leaves incomplete names for onboarding", async () => {
    expect(await profileFor({ ...user, firstName: " " })).toBeNull()
    expect(await database.select().from(tables.profiles)).toEqual([])
  })
})
