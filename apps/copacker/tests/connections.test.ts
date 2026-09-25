import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ database: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.database }))
import { connection, shopifyFor, amazonFor } from "../src/server/connections"
import { encrypt, decrypt } from "../src/server/security"
import { applyMigrations } from "./migrations"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const orgId = randomUUID()
const fetchMock = vi.fn<typeof fetch>()

beforeAll(async () => {
  context.database = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"))
  vi.stubEnv("SHOPIFY_CLIENT_ID", "client")
  vi.stubEnv("SHOPIFY_CLIENT_SECRET", "secret")
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  await pg.exec("TRUNCATE organizations CASCADE")
  await database.insert(tables.organizations).values({ id: orgId, name: "Buyer", kind: "buyer" })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function save(overrides: Record<string, unknown> = {}, provider: "shopify" | "amazon" = "shopify") {
  const stored = {
    token: "original",
    refreshToken: "refresh",
    expiresAt: Date.now() + 3600000,
    refreshExpiresAt: Date.now() + 86400000,
    ...overrides
  }
  await database.insert(tables.connections).values({
    orgId,
    provider,
    externalId: provider === "shopify" ? "buyer.myshopify.com" : "SELLER1",
    encryptedToken: encrypt(JSON.stringify(stored), `${orgId}:${provider}`)
  })
}
describe("merchant credential renewal and isolation", () => {
  it("uses a valid token without contacting the provider", async () => {
    await save()
    expect((await connection(orgId, "shopify")).token).toBe("original")
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("serializes concurrent renewal and persists both rotated credentials", async () => {
    await save({ expiresAt: 0 })
    fetchMock.mockImplementation(async () =>
      Response.json({
        access_token: "renewed",
        refresh_token: "rotated",
        expires_in: 3600,
        refresh_token_expires_in: 86400
      })
    )
    const results = await Promise.all([connection(orgId, "shopify"), connection(orgId, "shopify")])
    expect(results.map((r) => r.token)).toEqual(["renewed", "renewed"])
    expect(fetchMock).toHaveBeenCalledOnce()
    const init = fetchMock.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get("content-type")).toBe("application/x-www-form-urlencoded")
    const request = Object.fromEntries(new URLSearchParams(String(init?.body)))
    expect(request).toMatchObject({ grant_type: "refresh_token", refresh_token: "refresh" })
    const [row] = await database.select().from(tables.connections)
    expect(JSON.parse(decrypt(row!.encryptedToken, `${orgId}:shopify`))).toMatchObject({
      token: "renewed",
      refreshToken: "rotated"
    })
  })
  it("requires reconnect when the refresh grant has expired", async () => {
    await save({ expiresAt: 0, refreshExpiresAt: 0 })
    await expect(connection(orgId, "shopify")).rejects.toThrow("Reconnect Shopify")
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("preserves the last credentials if the provider rejects renewal", async () => {
    await save({ expiresAt: 0 })
    fetchMock.mockImplementation(async () => new Response(null, { status: 401 }))
    await expect(connection(orgId, "shopify")).rejects.toThrow("renewal failed")
    const [row] = await database.select().from(tables.connections)
    expect(JSON.parse(decrypt(row!.encryptedToken, `${orgId}:shopify`)).token).toBe("original")
  })
  it("refuses a PO against a different reconnected Shopify or Amazon account", async () => {
    await save()
    await save({}, "amazon")
    await expect(shopifyFor(orgId, "another.myshopify.com")).rejects.toThrow("originally selected")
    await expect(amazonFor(orgId, "OTHERSELLER")).rejects.toThrow("originally selected")
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("cannot replay credentials encrypted for a different organization", async () => {
    await save()
    await database
      .update(tables.connections)
      .set({ encryptedToken: encrypt(JSON.stringify({ token: "foreign" }), `${randomUUID()}:shopify`) })
      .where(eq(tables.connections.orgId, orgId))
    await expect(connection(orgId, "shopify")).rejects.toThrow(/authenticate|Unsupported state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
