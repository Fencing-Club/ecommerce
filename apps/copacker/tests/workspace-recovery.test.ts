import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown, signedIn: true }))
const jar = vi.hoisted(() => new Map<string, string>())
vi.mock("@/db", () => ({ db: () => context.current }))
vi.mock("../src/server/auth-session", () => ({
  authentication: async () => ({
    user: context.signedIn ? { id: "user_alex", email: "alex@example.com", emailVerified: true } : null
  }),
  signInRequest: vi.fn<() => void>()
}))
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) => jar.get(name),
  setCookie: (name: string, value: string) => void jar.set(name, value),
  getRequestUrl: () => new URL("http://localhost:3000/orders/deleted-order")
}))

import { ApiSessionError, session } from "../src/server/auth"
import { POST as action } from "../src/server/http/api/action"
import { GET as workspaceStatus } from "../src/server/http/api/workspace"
import { readWorkspacesData, recoverWorkspace as recover } from "../src/server/workspace-recovery"
import { workspaceCookie } from "../src/server/workspace-session"
import { applyMigrations } from "./migrations"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const buyerId = randomUUID(),
  supplierId = randomUUID(),
  outsiderId = randomUUID(),
  deletedId = randomUUID()
const onward = (path: string) => ({ options: { href: path } })
const post = (name: string, data: Record<string, unknown>) =>
  action(
    new Request("http://localhost:3000/api/action", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ action: name, data })
    })
  )

beforeAll(async () => {
  context.current = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
afterEach(() => vi.unstubAllEnvs())
beforeEach(async () => {
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test")
  context.signedIn = true
  jar.clear()
  jar.set(workspaceCookie, deletedId)
  await pg.exec("TRUNCATE organizations, profiles CASCADE")
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Harbor Goods", kind: "buyer" },
    { id: supplierId, name: "Lotus Manufacturing", kind: "supplier" },
    { id: outsiderId, name: "Another company", kind: "buyer" }
  ])
  await database.insert(tables.memberships).values([
    { orgId: buyerId, userId: "user_alex", email: "alex@example.com", role: "owner" },
    { orgId: supplierId, userId: "user_alex", email: "alex@example.com", role: "member" }
  ])
  await database.insert(tables.profiles).values({ userId: "user_alex", firstName: "Alex", lastName: "Rivera" })
})

describe("workspace recovery", () => {
  it("keeps a valid selected workspace and its membership permissions", async () => {
    jar.set(workspaceCookie, supplierId)
    const current = await session()
    expect(current.org.id).toBe(supplierId)
    expect(current.role).toBe("member")
    expect(current.workspaces.map((w) => w.id).sort()).toEqual([buyerId, supplierId].sort())
  })

  it.each([deletedId, "not-a-uuid"])(
    "redirects an unavailable selection without choosing another company (%s)",
    async (id) => {
      jar.set(workspaceCookie, id)
      await expect(session()).rejects.toMatchObject(onward("/workspaces?unavailable=1"))
      expect(jar.get(workspaceCookie)).toBe(id)
      await expect(recover()).rejects.toMatchObject(onward("/workspaces"))
      expect(jar.get(workspaceCookie)).toBe(id)
    }
  )

  it("persists the only remaining workspace before opening its home", async () => {
    await database.delete(tables.memberships).where(eq(tables.memberships.orgId, supplierId))
    await expect(session()).rejects.toMatchObject(onward("/workspaces?unavailable=1"))
    await expect(readWorkspacesData()).rejects.toMatchObject({
      options: { href: "/workspaces/recover", reloadDocument: true }
    })
    await expect(recover()).rejects.toMatchObject(onward("/"))
    expect(jar.get(workspaceCookie)).toBe(buyerId)
    expect((await session()).org.id).toBe(buyerId)
  })

  it("starts setup when no memberships remain", async () => {
    await database.delete(tables.memberships)
    await expect(session()).rejects.toMatchObject(onward("/onboarding"))
    await expect(recover()).rejects.toMatchObject(onward("/onboarding"))
    expect(await (await workspaceStatus()).json()).toEqual({ redirect: "/onboarding" })
  })

  it("does not choose an arbitrary company when there is no saved selection", async () => {
    jar.clear()
    await expect(session()).rejects.toMatchObject(onward("/workspaces"))
    expect(await (await workspaceStatus()).json()).toEqual({ redirect: "/workspaces" })
  })

  it("tells open tabs to recover after access is removed, even when the workspace still exists", async () => {
    jar.set(workspaceCookie, outsiderId)
    const response = await workspaceStatus()
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ redirect: "/workspaces?unavailable=1" })
    jar.set(workspaceCookie, supplierId)
    expect(await (await workspaceStatus()).json()).toEqual({ id: supplierId })
  })

  it("requires sign-in when the organization-bound sign-in session has expired", async () => {
    context.signedIn = false
    await expect(recover()).rejects.toMatchObject(onward("/login?next=%2Fworkspaces"))
    await expect(workspaceStatus()).rejects.toMatchObject(onward("/login?next=%2Fworkspaces"))
    expect(jar.get(workspaceCookie)).toBe(deletedId)
  })

  it("returns only presentation data for the workspace picker", async () => {
    const page = await readWorkspacesData()
    expect(page.workspaces).toHaveLength(2)
    for (const workspace of page.workspaces) {
      expect(Object.keys(workspace).sort()).toEqual(["id", "kind", "name"])
    }
    expect(page.workspaces.map(({ id }) => id)).not.toContain(outsiderId)
  })

  it("rejects unavailable selections for API callers without redirecting or executing work", async () => {
    await expect(session("api")).rejects.toBeInstanceOf(ApiSessionError)
    await expect(session("api")).rejects.toMatchObject({ status: 403 })
    context.signedIn = false
    await expect(session("api")).rejects.toMatchObject({ status: 401 })
  })

  it("allows switching after deletion without requiring an active workspace", async () => {
    const response = await post("workspace.switch", { id: buyerId })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ redirect: "/" })
    expect(jar.get(workspaceCookie)).toBe(buyerId)
  })

  it("rechecks membership on selection and rejects workspaces belonging to another user", async () => {
    const response = await post("workspace.switch", { id: outsiderId })
    expect(response.ok).toBe(false)
    expect(jar.get(workspaceCookie)).toBe(deletedId)
  })

  it("never applies a stale form to the remaining workspace, even when there is only one", async () => {
    await database.delete(tables.memberships).where(eq(tables.memberships.orgId, supplierId))
    await expect(post("supplier.create", { name: "Accidental supplier" })).rejects.toMatchObject(
      onward("/workspaces?unavailable=1")
    )
    expect(await database.select().from(tables.suppliers)).toEqual([])
    expect(jar.get(workspaceCookie)).toBe(deletedId)
  })
})
