import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown, role: "owner", orgId: "" }))
vi.mock("@/db", () => ({ db: () => context.current }))
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn<() => void>() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))
vi.mock("@/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => ({
    user: { id: "user-1", email: "owner@example.com" },
    org: { id: context.orgId, kind: "buyer" },
    role: context.role,
    access: {}
  })
}))
vi.mock("@/server/amazon-notifications", () => ({
  queueAmazonSubscription: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
}))
vi.mock("@/server/first-sync", () => ({ startFirstSync: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }))
import { GET } from "../src/app/api/connections/[provider]/route"
import { decrypt } from "../src/server/security"
import { applyMigrations } from "./migrations"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const orgId = randomUUID()
const params = { params: Promise.resolve({ provider: "amazon" }) }
const fetchMock = vi.fn<typeof fetch>()
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
  vi.stubEnv("APP_URL", "https://copacker.ai")
  vi.stubEnv("AMAZON_APPLICATION_ID", "amzn1.sellerapps.app.example")
  vi.stubEnv("AMAZON_CLIENT_ID", "client")
  vi.stubEnv("AMAZON_CLIENT_SECRET", "secret")
  vi.stubEnv("AMAZON_APP_DRAFT", "true")
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"))
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  await pg.exec("TRUNCATE organizations CASCADE")
  await database.insert(tables.organizations).values({ id: orgId, name: "Contoso", kind: "buyer" })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("Amazon sign-in", () => {
  it.each([
    ["US", "sellercentral.amazon.com"],
    ["CA", "sellercentral.amazon.ca"],
    ["MX", "sellercentral.amazon.com.mx"],
    ["BR", "sellercentral.amazon.com.br"]
  ])("opens %s Seller Central with draft consent", async (country, host) => {
    const response = await GET(new Request(`https://copacker.ai/api/connections/amazon?marketplace=${country}`), params)
    const url = new URL(response.headers.get("location")!)
    expect(url.hostname).toBe(host)
    expect(url.searchParams.get("version")).toBe("beta")
    expect(url.searchParams.get("redirect_uri")).toBe("https://copacker.ai/api/connections/amazon")
    expect(url.searchParams.get("state")).toBeTruthy()
    expect(await database.select().from(tables.oauthStates)).toHaveLength(1)
  })
  it("rejects unknown marketplaces without creating a state", async () => {
    expect(
      (await GET(new Request("https://copacker.ai/api/connections/amazon?marketplace=evil.example"), params)).status
    ).toBe(400)
    expect(await database.select().from(tables.oauthStates)).toHaveLength(0)
  })
  it("exchanges the code and stores credentials without user-entered tokens, rejecting replay", async () => {
    vi.stubEnv("AMAZON_APP_DRAFT", "false")
    const start = await GET(new Request("https://copacker.ai/api/connections/amazon"), params)
    const target = new URL(start.headers.get("location")!)
    expect(target.searchParams.has("version")).toBe(false)
    fetchMock.mockResolvedValueOnce(Response.json({ refresh_token: "private-refresh-token" }))
    const callback = `https://copacker.ai/api/connections/amazon?state=${target.searchParams.get("state")}&selling_partner_id=A12345678&spapi_oauth_code=temporary-code`
    expect((await GET(new Request(callback), params)).headers.get("location")).toBe(
      "https://copacker.ai/settings?connected=amazon#integrations"
    )
    const [saved] = await database.select().from(tables.connections)
    expect(saved?.externalId).toBe("A12345678")
    expect(saved?.encryptedToken).not.toContain("private-refresh-token")
    expect(JSON.parse(decrypt(saved!.encryptedToken, `${orgId}:amazon`))).toEqual({ token: "private-refresh-token" })
    expect((await GET(new Request(callback), params)).status).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
