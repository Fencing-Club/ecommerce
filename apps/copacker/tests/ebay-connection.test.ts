import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown, role: "owner", kind: "buyer", orgId: "" }))
vi.mock("@/db", () => ({ db: () => context.current }))

vi.mock("@/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => ({
    user: { id: "user-1", email: "owner@example.com" },
    org: { id: context.orgId, kind: context.kind },
    role: context.role,
    access: {}
  })
}))
import { LocalizedError } from "../src/i18n/errors"
import { AccessError } from "../src/i18n/errors"
import { connection, disconnect } from "../src/server/connections"
import { GET } from "../src/server/http/api/connections/$provider"
import { decrypt, hash } from "../src/server/security"
import { applyMigrations } from "./migrations"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const orgId = randomUUID()
const fetchMock = vi.fn<typeof fetch>()
const params = { params: { provider: "ebay" } }

beforeAll(async () => {
  context.current = database
  context.orgId = orgId
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  context.role = "owner"
  context.kind = "buyer"
  vi.stubEnv("APP_URL", "https://copacker.ai")
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"))
  vi.stubEnv("EBAY_CLIENT_ID", "Copacker-PRD")
  vi.stubEnv("EBAY_CLIENT_SECRET", "secret")
  vi.stubEnv("EBAY_RU_NAME", "Copacker-RuName")
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  await pg.exec("TRUNCATE organizations, jobs CASCADE")
  await database.insert(tables.organizations).values({ id: orgId, name: "Fencing Club", kind: "buyer" })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("connecting eBay", () => {
  it("sends an owner or admin to eBay's consent page with a single-use state", async () => {
    for (const role of ["owner", "admin"]) {
      context.role = role
      const response = await GET(new Request("https://copacker.ai/api/connections/ebay"), params)
      const target = new URL(response.headers.get("location")!)
      expect(target.origin).toBe("https://auth.ebay.com")
      expect(target.searchParams.get("redirect_uri")).toBe("Copacker-RuName")
      expect(target.searchParams.get("client_id")).toBe("Copacker-PRD")
      const [state] = await database
        .select()
        .from(tables.oauthStates)
        .where((await import("drizzle-orm")).eq(tables.oauthStates.hash, hash(target.searchParams.get("state")!)))
      expect(state).toMatchObject({ provider: "ebay", orgId, userId: "user-1" })
    }
  })

  it("is refused to members and to supplier workspaces", async () => {
    context.role = "member"
    await expect(GET(new Request("https://copacker.ai/api/connections/ebay"), params)).rejects.toBeInstanceOf(
      AccessError
    )
    context.role = "owner"
    context.kind = "supplier"
    await expect(GET(new Request("https://copacker.ai/api/connections/ebay"), params)).rejects.toBeInstanceOf(
      LocalizedError
    )
    expect(await database.select().from(tables.oauthStates)).toEqual([])
  })

  it("says eBay isn't set up when Copacker has no eBay keys", async () => {
    vi.stubEnv("EBAY_RU_NAME", "")
    expect((await GET(new Request("https://copacker.ai/api/connections/ebay"), params)).status).toBe(503)
  })

  it("stores the seller's refresh token under their user ID and starts the first sync and subscription", async () => {
    const start = await GET(new Request("https://copacker.ai/api/connections/ebay"), params)
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith("/identity/v1/oauth2/token")) {
        return Response.json({
          access_token: "access",
          expires_in: 7200,
          refresh_token: "seller-refresh",
          refresh_token_expires_in: 47304000
        })
      }
      if (url === "https://apiz.ebay.com/commerce/identity/v1/user/") {
        return Response.json({ userId: "vWvOsUq8KJk", username: "fencing_club" })
      }
      throw new Error(`Unexpected request to ${url}`)
    })
    const response = await GET(
      new Request(`https://copacker.ai/api/connections/ebay?state=${state}&code=auth-code&expires_in=299`),
      params
    )
    expect(response.headers.get("location")).toBe("https://copacker.ai/settings?connected=ebay#integrations")
    const [row] = await database.select().from(tables.connections)
    expect(row).toMatchObject({ provider: "ebay", externalId: "vWvOsUq8KJk" })
    expect(JSON.parse(decrypt(row!.encryptedToken, `${orgId}:ebay`))).toMatchObject({ token: "seller-refresh" })
    const exchange = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/oauth2/token"))!
    expect(Object.fromEntries(new URLSearchParams(String(exchange[1]?.body)))).toEqual({
      grant_type: "authorization_code",
      code: "auth-code",
      redirect_uri: "Copacker-RuName"
    })
    const jobs = await database.select().from(tables.jobs)
    expect(jobs.map((job) => job.kind).toSorted()).toEqual(["ebay-subscribe", "sales"])
    // The state can't be used twice.
    expect(
      (await GET(new Request(`https://copacker.ai/api/connections/ebay?state=${state}&code=auth-code`), params)).status
    ).toBe(400)
  })

  it("says the connection failed when eBay refuses the code", async () => {
    const start = await GET(new Request("https://copacker.ai/api/connections/ebay"), params)
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!
    fetchMock.mockResolvedValue(Response.json({ error: "invalid_grant" }, { status: 400 }))
    const response = await GET(new Request(`https://copacker.ai/api/connections/ebay?state=${state}&code=old`), params)
    expect(response.status).toBe(400)
    expect(await database.select().from(tables.connections)).toEqual([])
  })

  it("asks the seller to reconnect once their authorization has expired, and disconnects locally", async () => {
    const { encrypt } = await import("../src/server/security")
    await database.insert(tables.connections).values({
      orgId,
      provider: "ebay",
      externalId: "vWvOsUq8KJk",
      encryptedToken: encrypt(JSON.stringify({ token: "old", refreshExpiresAt: Date.now() - 1000 }), `${orgId}:ebay`)
    })
    await expect(connection(orgId, "ebay")).rejects.toThrow("Reconnect eBay")
    expect(await disconnect(orgId, "ebay")).toEqual({ revoked: false })
    expect(await database.select().from(tables.connections)).toEqual([])
  })
})
