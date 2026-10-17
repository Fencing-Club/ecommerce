import { randomUUID } from "node:crypto"
import { gzipSync } from "node:zlib"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { applyMigrations } from "./migrations"
const context = vi.hoisted(() => ({ database: null as unknown, orgId: "", userId: "user-1", role: "owner" }))
vi.mock("@/db", () => ({ db: () => context.database }))

vi.mock("@/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => ({
    user: { id: context.userId },
    org: { id: context.orgId, kind: "buyer" },
    role: context.role,
    access: {}
  })
}))
import { GET, POST } from "../src/server/http/api/connections/amazon-ads"
vi.mock("../src/server/exchange-rates", () => ({ syncExchangeRates: vi.fn<() => Promise<void>>() }))
import {
  adsCharge,
  adsStatus,
  amazonAdsJob,
  disconnectAds,
  queueAdsSync,
  saveAdsConnection
} from "../src/server/amazon-ads"
import { adsToken, AmazonAds, downloadAdsReport } from "../src/server/amazon-ads-client"
import { platformCharges } from "../src/server/overview-sales"
import { encrypt } from "../src/server/security"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const orgId = randomUUID(),
  generation = randomUUID()
const profile = {
  adsAccountId: "amzn1.ads-account.g.test",
  profileId: "1234",
  countryCode: "US",
  currencyCode: "USD",
  timezone: "America/Los_Angeles",
  accountInfo: { id: "SELLER1", type: "seller", marketplaceStringId: "ATVPDKIKX0DER" }
}
const accountsResponse = () =>
  Response.json({
    adsAccounts: [
      {
        adsAccountId: profile.adsAccountId,
        alternateIds: [{ profileId: profile.profileId, countryCode: "US" }]
      }
    ]
  })
const reportResponse = (status = "COMPLETED") =>
  Response.json({
    success: [
      {
        report: {
          reportId: "report",
          status,
          completedReportParts: status === "COMPLETED" ? [{ url: "https://reports.s3.amazonaws.com/report" }] : null,
          warnings: null
        }
      }
    ]
  })
const reportRow = (cost: number, product = "SPONSORED_PRODUCTS") => ({
  "date.value": "2026-10-12",
  "campaign.id": "1",
  "campaign.country": "US",
  "budgetCurrency.value": "USD",
  "adProduct.value": product,
  "metric.totalCost": cost
})
const fetchMock = vi.fn<typeof fetch>()
beforeAll(async () => {
  context.database = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  context.orgId = orgId
  context.userId = "user-1"
  context.role = "owner"
  vi.stubEnv("APP_URL", "https://copacker.ai")
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"))
  vi.stubEnv("AMAZON_ADS_CLIENT_ID", "ads-client")
  vi.stubEnv("AMAZON_ADS_CLIENT_SECRET", "ads-secret")
  vi.stubEnv("AMAZON_ADS_RELAY_URL", "")
  vi.stubEnv("AMAZON_ADS_RELAY_SECRET", "")
  vi.stubEnv("AMAZON_ADS_RELAY_ORIGINS", "")
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  await pg.exec("TRUNCATE organizations CASCADE; TRUNCATE jobs")
  await database.insert(tables.organizations).values({ id: orgId, name: "Buyer", kind: "buyer" })
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId: "SELLER1", encryptedToken: "seller-token" })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
async function connect() {
  await database.insert(tables.amazonAdsConnections).values({
    orgId,
    generation,
    sellerId: "SELLER1",
    profiles: [profile],
    encryptedToken: encrypt("refresh", `${orgId}:amazon-ads`)
  })
}
describe("Amazon Ads authorization and transport", () => {
  it.each(["https://ads-fix-1234abcd.local.copacker.ai", "https://pr-42.preview.copacker.ai"])(
    "relays consent to %s without a relay session or database, then enforces the original user and replay checks",
    async (origin) => {
      const relay = "https://staging.copacker.ai"
      const path = "/api/connections/amazon-ads"
      vi.stubEnv("APP_URL", origin)
      vi.stubEnv("AMAZON_ADS_RELAY_URL", relay + path)
      vi.stubEnv("AMAZON_ADS_RELAY_SECRET", Buffer.alloc(32, 9).toString("base64"))
      vi.stubEnv("AMAZON_ADS_RELAY_ORIGINS", "https://*.local.copacker.ai,https://pr-*.preview.copacker.ai")
      const start = new URL((await GET(new Request(origin + path))).headers.get("location")!)
      expect(start.searchParams.get("redirect_uri")).toBe(relay + path)
      const state = start.searchParams.get("state")!
      vi.stubEnv("APP_URL", relay)
      context.role = "member"
      context.database = null
      const response = await GET(new Request(`${relay}${path}?state=${state}&code=code`))
      expect(response.status).toBe(302)
      const callback = new Request(response.headers.get("location")!)
      expect(callback.url.startsWith(origin + path)).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
      context.database = database
      context.role = "owner"
      vi.stubEnv("APP_URL", origin)
      context.userId = "wrong-user"
      expect((await GET(callback)).status).toBe(400)
      context.userId = "user-1"
      fetchMock.mockImplementation(async (url) => {
        if (String(url).includes("auth/o2")) {
          return Response.json({ access_token: "access", refresh_token: "refresh" })
        }
        return String(url).includes("adsAccounts") ? accountsResponse() : Response.json([profile])
      })
      expect((await GET(callback)).headers.get("location")).toBe(`${origin}/settings#integrations`)
      expect(new URLSearchParams(String(fetchMock.mock.calls[0]![1]?.body)).get("redirect_uri")).toBe(relay + path)
      expect((await GET(callback)).status).toBe(400)
      expect(await adsStatus(orgId)).toMatchObject({ connected: true, active: true })
    }
  )
  it("binds consent to the initiating user and consumes the state once", async () => {
    const start = await GET(new Request("https://copacker.ai/api/connections/amazon-ads"))
    const target = new URL(start.headers.get("location")!)
    expect(target.searchParams.get("scope")).toBe("advertising::campaign_management")
    expect(target.searchParams.get("redirect_uri")).toBe("https://copacker.ai/api/connections/amazon-ads")
    const callback = new Request(
      `https://copacker.ai/api/connections/amazon-ads?state=${target.searchParams.get("state")}&code=code`
    )
    context.userId = "another-user"
    expect((await GET(callback)).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
    context.userId = "user-1"
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("auth/o2")) {
        return Response.json({ access_token: "access", refresh_token: "refresh" })
      }
      return String(url).includes("adsAccounts") ? accountsResponse() : Response.json([profile])
    })
    expect((await GET(callback)).headers.get("location")).toBe("https://copacker.ai/settings#integrations")
    expect(await adsStatus(orgId)).toMatchObject({ connected: true, active: true })
    expect((await GET(callback)).status).toBe(400)
  })
  it("rejects expired consent, a different workspace, non-admins and cross-origin mutations", async () => {
    const start = await GET(new Request("https://copacker.ai/api/connections/amazon-ads"))
    const state = new URL(start.headers.get("location")!).searchParams.get("state")
    const callback = new Request(`https://copacker.ai/api/connections/amazon-ads?state=${state}&code=code`)
    context.orgId = randomUUID()
    expect((await GET(callback)).status).toBe(409)
    context.orgId = orgId
    await database.update(tables.oauthStates).set({ expiresAt: new Date(0) })
    expect((await GET(callback)).status).toBe(400)
    expect(
      (
        await POST(
          new Request("https://copacker.ai/api/connections/amazon-ads", {
            method: "POST",
            headers: { origin: "https://example.com" },
            body: JSON.stringify({ action: "disconnect" })
          })
        )
      ).status
    ).toBe(403)
    context.role = "member"
    expect(
      await (await GET(new Request("https://copacker.ai/api/connections/amazon-ads?status=1"))).json()
    ).toMatchObject({ connected: false })
    await expect(GET(new Request("https://copacker.ai/api/connections/amazon-ads"))).rejects.toThrow("Only admins")
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("uses distinct developer credentials and form-encoded grants", async () => {
    fetchMock.mockResolvedValue(Response.json({ access_token: "access", refresh_token: "refresh" }))
    await adsToken({
      grant_type: "authorization_code",
      code: "code",
      redirect_uri: "https://copacker.ai/api/connections/amazon-ads"
    })
    expect(Object.fromEntries(new URLSearchParams(String(fetchMock.mock.calls[0]![1]!.body)))).toMatchObject({
      client_id: "ads-client",
      client_secret: "ads-secret",
      code: "code"
    })
  })
  it("never imports another seller, vendor or unsupported region", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json([
        profile,
        { ...profile, accountInfo: { ...profile.accountInfo, id: "OTHER" } },
        { ...profile, accountInfo: { ...profile.accountInfo, type: "vendor" } },
        { ...profile, countryCode: "DE" }
      ])
    )
    fetchMock.mockResolvedValueOnce(accountsResponse())
    expect(await new AmazonAds("access").profiles("SELLER1")).toEqual([profile])
  })
  it("does not save an authorization with no matching profiles", async () => {
    fetchMock.mockResolvedValue(Response.json([]))
    await expect(saveAdsConnection(orgId, "SELLER1", "refresh", new AmazonAds("access"))).rejects.toThrow("No matching")
    expect(await database.select().from(tables.amazonAdsConnections)).toEqual([])
  })
  it("finds the matching account after a paginated response", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json([profile]))
      .mockResolvedValueOnce(Response.json({ adsAccounts: [], nextToken: "next" }))
      .mockResolvedValueOnce(accountsResponse())
    expect(await new AmazonAds("access").profiles("SELLER1")).toEqual([profile])
    expect(fetchMock.mock.calls[2]![1]).toMatchObject({
      headers: { "Content-Type": "application/vnd.listaccountsresource.v1+json" },
      body: JSON.stringify({ maxResults: 100, nextToken: "next" })
    })
  })
  it("stores grants encrypted and rejects a changed seller", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("adsAccounts") ? accountsResponse() : Response.json([profile])
    )
    await saveAdsConnection(orgId, "SELLER1", "refresh", new AmazonAds("access"))
    const [grant] = await database.select().from(tables.amazonAdsConnections)
    expect(grant!.encryptedToken).not.toContain("refresh")
    await expect(saveAdsConnection(orgId, "OTHER", "refresh", new AmazonAds("access"))).rejects.toThrow("No matching")
  })
  it("downloads bounded gzip without authorization headers", async () => {
    fetchMock.mockResolvedValue(new Response(gzipSync(JSON.stringify([reportRow(1.25)]))))
    expect(await downloadAdsReport("https://reports.s3.amazonaws.com/report")).toEqual([
      {
        date: "2026-10-12",
        campaignId: "1",
        country: "US",
        currency: "USD",
        product: "SPONSORED_PRODUCTS",
        cost: 1.25,
        sku: null
      }
    ])
    expect(fetchMock.mock.calls[0]![1]!.headers).toBeUndefined()
    await expect(downloadAdsReport("https://example.com/report")).rejects.toThrow("Unexpected")
  })
  it("scopes current API reports by account, country and sponsored ad products", async () => {
    fetchMock.mockResolvedValue(reportResponse("PENDING"))
    expect(await new AmazonAds("access").createReport(profile, "2026-10-01", "2026-10-14")).toBe("report")
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toMatchObject({
      accessRequestedAccounts: [{ advertiserAccountId: profile.adsAccountId }],
      reports: [
        {
          query: {
            fields: expect.arrayContaining(["date.value", "metric.totalCost", "budgetCurrency.value"]),
            filter: {
              and: {
                filters: expect.arrayContaining([
                  { on: { field: "campaign.country", comparisonOperator: "EQUALS", not: false, values: ["US"] } }
                ])
              }
            }
          }
        }
      ]
    })
  })
  it("retries per-report throttling and rejects redacted reports", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: [{ errors: [{ code: "TOO_MANY_REQUESTS" }] }] }))
    await expect(new AmazonAds("access").createReport(profile, "2026-10-01", "2026-10-14")).rejects.toThrow("429")
    fetchMock.mockResolvedValueOnce(
      Response.json({
        success: [{ report: { reportId: "report", status: "COMPLETED", warnings: [{ field: "metric.totalCost" }] } }]
      })
    )
    await expect(new AmazonAds("access").report("report")).rejects.toThrow("incomplete")
  })
})
describe("durable ad spend imports", () => {
  it("queues bounded windows once while work is active", async () => {
    await connect()
    await queueAdsSync(orgId, new Date("2026-10-14T12:00:00Z"))
    await queueAdsSync(orgId, new Date("2026-10-14T12:00:00Z"))
    const work = await database.select().from(tables.jobs)
    expect(work).toHaveLength(1)
    expect(work[0]!.payload).toMatchObject({ from: "2026-07-17", to: "2026-10-14", profileId: "1234" })
    expect(await adsStatus(orgId)).toMatchObject({ connected: true, active: true })
  })
  it("abandons disconnected or replaced authorizations", async () => {
    await connect()
    await disconnectAds(orgId)
    await amazonAdsJob(
      { orgId, generation, profileId: "1234", from: "2026-10-12", to: "2026-10-13" },
      async () => undefined
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("stores SKU advertising detail without overwriting all-product totals", async () => {
    await connect()
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("auth/o2")) {
        return Response.json({ access_token: "access" })
      }
      if (String(url).includes("amazonaws.com")) {
        return Response.json([{ ...reportRow(1.25), "advertisedProductSku.value": "SKU1" }])
      }
      return reportResponse()
    })
    await amazonAdsJob(
      {
        orgId,
        generation,
        profileId: "1234",
        from: "2026-10-12",
        to: "2026-10-13",
        reportId: "report",
        productDetail: true
      },
      async () => undefined
    )
    expect(await database.select().from(tables.amazonAdsDays)).toHaveLength(0)
    const evidence = await database.select().from(tables.analyticsEvidence)
    expect(evidence).toHaveLength(2)
    expect(evidence[0]?.data.rows).toEqual([expect.objectContaining({ sku: "SKU1", cost: 1.25 })])
  })
  it("persists report IDs before polling", async () => {
    await connect()
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("auth/o2") ? Response.json({ access_token: "access" }) : reportResponse("PENDING")
    )
    await expect(
      amazonAdsJob(
        { orgId, generation, profileId: "1234", from: "2026-10-12", to: "2026-10-13" },
        async () => undefined
      )
    ).rejects.toMatchObject({
      options: {
        progressed: true,
        payload: {
          reportId: "report"
        }
      }
    })
  })
  it.each(["PENDING", "PROCESSING"])("keeps polling a %s report with null files and warnings", async (status) => {
    await connect()
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("auth/o2") ? Response.json({ access_token: "access" }) : reportResponse(status)
    )
    await expect(
      amazonAdsJob(
        { orgId, generation, profileId: "1234", from: "2026-10-12", to: "2026-10-13", reportId: "report" },
        async () => undefined
      )
    ).rejects.toMatchObject({
      message: "Waiting for Amazon Ads report",
      options: { delayMs: 300000 }
    })
    expect(await database.select().from(tables.amazonAdsDays)).toEqual([])
    expect(await database.select().from(tables.analyticsEvidence)).toEqual([])
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/create/"))).toBe(false)
  })
  it("atomically imports all products, writes zero days and replaces corrections without adding twice", async () => {
    await connect()
    let cost = 1.25
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("auth/o2")) {
        return Response.json({ access_token: "access" })
      }
      if (String(url).includes("amazonaws.com")) {
        return Response.json([
          reportRow(cost),
          reportRow(cost, "SPONSORED_BRANDS"),
          reportRow(cost, "SPONSORED_DISPLAY")
        ])
      }
      return reportResponse()
    })
    const payload = {
      orgId,
      generation,
      profileId: "1234",
      from: "2026-10-12",
      to: "2026-10-13",
      reportId: "report"
    }
    await expect(amazonAdsJob(payload, async () => undefined)).rejects.toMatchObject({
      options: { payload: expect.objectContaining({ productDetail: true }) }
    })
    expect((await database.select().from(tables.amazonAdsDays)).map((d) => d.cost)).toEqual(["3.750000", "0.000000"])
    cost = 2
    await expect(amazonAdsJob(payload, async () => undefined)).rejects.toMatchObject({
      options: { payload: expect.objectContaining({ productDetail: true }) }
    })
    const from = new Date("2026-10-12T07:00:00Z"),
      to = new Date("2026-10-14T07:00:00Z")
    expect(await adsCharge(orgId, "SELLER1", undefined, from, to, "USD")).toBe(-600)
    await database.insert(tables.amazonTransactions).values({
      orgId,
      externalAccountId: "SELLER1",
      transactionId: "payment",
      type: "ProductAdsPayment",
      postedAt: from,
      currency: "USD",
      totalMinor: -900,
      feesMinor: 0,
      data: {}
    })
    const accounts = [{ provider: "amazon" as const, externalId: "SELLER1" }]
    expect(
      (await platformCharges(orgId, accounts, from, to, "USD"))
        .filter((line) => line.key === "amazon-ads")
        .map((line) => line.minor)
    ).toEqual([-600])
    expect(
      (await platformCharges(orgId, accounts, new Date("2026-10-11T07:00:00Z"), to, "USD"))
        .filter((line) => line.key === "amazon-ads")
        .map((line) => line.minor)
    ).toEqual([-900])
    expect(await adsCharge(orgId, "OTHER", undefined, from, to, "USD")).toBeNull()
    expect(await adsCharge(orgId, "SELLER1", "OTHER", from, to, "USD")).toBeNull()
    expect(await adsCharge(orgId, "SELLER1", undefined, new Date("2026-10-11T07:00:00Z"), to, "USD")).toBeNull()
    expect(await database.select().from(tables.amazonAdsDays)).toHaveLength(2)
  })
  it("leaves stored data untouched on a failed product report", async () => {
    await connect()
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("auth/o2") ? Response.json({ access_token: "access" }) : reportResponse("FAILED")
    )
    await expect(
      amazonAdsJob(
        {
          orgId,
          generation,
          profileId: "1234",
          from: "2026-10-12",
          to: "2026-10-13",
          reportId: "report"
        },
        async () => undefined
      )
    ).rejects.toThrow("generation failed")
    expect(await database.select().from(tables.amazonAdsDays)).toEqual([])
  })
  it.each([{ parts: [] }, { parts: null }, { parts: undefined }])(
    "rejects completed reports with $parts downloads without erasing spend",
    async ({ parts }) => {
      await connect()
      await database.insert(tables.amazonAdsDays).values({
        orgId,
        sellerId: "SELLER1",
        profileId: "1234",
        marketplaceId: "ATVPDKIKX0DER",
        day: "2026-10-12",
        currency: "USD",
        cost: "12.500000",
        syncedAt: new Date()
      })
      fetchMock.mockImplementation(async (url) =>
        String(url).includes("auth/o2")
          ? Response.json({ access_token: "access" })
          : Response.json({
              success: [
                { report: { reportId: "report", status: "COMPLETED", completedReportParts: parts, warnings: null } }
              ]
            })
      )
      await expect(
        amazonAdsJob(
          { orgId, generation, profileId: "1234", from: "2026-10-12", to: "2026-10-12", reportId: "report" },
          async () => undefined
        )
      ).rejects.toThrow("download is missing")
      expect((await database.select().from(tables.amazonAdsDays)).map((day) => day.cost)).toEqual(["12.500000"])
    }
  )
  it.each(["token", "report", "download"])("retries a %s network failure without writing spend", async (stage) => {
    await connect()
    fetchMock.mockImplementation(async (url) => {
      const location = String(url)
      let current = "report"
      if (location.includes("auth/o2")) {
        current = "token"
      } else if (location.includes("amazonaws.com")) {
        current = "download"
      }
      if (current === stage) {
        throw new TypeError("fetch failed")
      }
      return current === "token" ? Response.json({ access_token: "access" }) : reportResponse()
    })
    await expect(
      amazonAdsJob(
        { orgId, generation, profileId: "1234", from: "2026-10-12", to: "2026-10-12", reportId: "report" },
        async () => undefined
      )
    ).rejects.toMatchObject({ options: { delayMs: 60000 } })
    expect(await database.select().from(tables.amazonAdsDays)).toEqual([])
  })
})
