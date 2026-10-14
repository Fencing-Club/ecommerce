import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ database: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.database }))
import {
  connection,
  shopifyFor,
  amazonFor,
  connectAmazonSelfAuthorized,
  amazonSelfAuthEnabled
} from "../src/server/connections"
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

describe("Amazon self-authorization", () => {
  const token = `Atzr|${"x".repeat(40)}`
  const participations = (marketplaceId: string) =>
    Response.json({ payload: [{ marketplace: { id: marketplaceId }, participation: { isParticipating: true } }] })

  beforeEach(() => {
    vi.stubEnv("AMAZON_CLIENT_ID", "amazon-client")
    vi.stubEnv("AMAZON_CLIENT_SECRET", "amazon-secret")
  })

  it("checks the token with Amazon and saves it encrypted for the workspace", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: "access", expires_in: 3600 }))
      .mockResolvedValueOnce(participations("ATVPDKIKX0DER"))
    expect(await connectAmazonSelfAuthorized(orgId, { sellerId: " a2ciyiv0e1fhu3 ", refreshToken: token })).toEqual({
      sellerId: "A2CIYIV0E1FHU3"
    })
    const [saved] = await database.select().from(tables.connections)
    expect(saved).toMatchObject({ provider: "amazon", externalId: "A2CIYIV0E1FHU3" })
    expect(saved?.encryptedToken).not.toContain("Atzr")
    expect(JSON.parse(decrypt(saved!.encryptedToken, `${orgId}:amazon`))).toEqual({ token })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/sellers/v1/marketplaceParticipations")
  })

  it("saves nothing when Amazon rejects the token or the seller isn't in the US", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 400 }))
    await expect(
      connectAmazonSelfAuthorized(orgId, { sellerId: "A2CIYIV0E1FHU3", refreshToken: token })
    ).rejects.toThrow("didn’t accept this token")
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: "access", expires_in: 3600 }))
      .mockResolvedValueOnce(participations("A1F83G8C2ARO7P"))
    await expect(
      connectAmazonSelfAuthorized(orgId, { sellerId: "A2CIYIV0E1FHU3", refreshToken: token })
    ).rejects.toThrow("US marketplace")
    await expect(
      connectAmazonSelfAuthorized(orgId, { sellerId: "A2CIYIV0E1FHU3", refreshToken: "nope" })
    ).rejects.toThrow("shipments.amazonAuthorization.refreshToken")
    expect(await database.select().from(tables.connections)).toHaveLength(0)
  })
})

describe("Amazon self-authorization configuration", () => {
  it("defaults to enabled and respects an explicit false", () => {
    vi.stubEnv("AMAZON_SELF_AUTH_ENABLED", undefined)
    expect(amazonSelfAuthEnabled()).toBe(true)
    vi.stubEnv("AMAZON_SELF_AUTH_ENABLED", "true")
    expect(amazonSelfAuthEnabled()).toBe(true)
    vi.stubEnv("AMAZON_SELF_AUTH_ENABLED", "false")
    expect(amazonSelfAuthEnabled()).toBe(false)
  })
  it("rejects manual tokens before validation or network access when disabled", async () => {
    vi.stubEnv("AMAZON_SELF_AUTH_ENABLED", "false")
    await expect(connectAmazonSelfAuthorized(orgId, {})).rejects.toMatchObject({ key: "forbidden" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
