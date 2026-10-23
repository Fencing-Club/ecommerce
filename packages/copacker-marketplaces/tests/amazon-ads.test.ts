import { gzipSync } from "node:zlib"
import { describe, expect, it, vi } from "vitest"
import { AdsProfileError, AdsRequestError, adsToken, AmazonAds, downloadAdsReport } from "../src/amazon-ads"

const app = { clientId: "ads-client", clientSecret: "ads-secret" }
const profile = {
  profileId: 1234,
  countryCode: "US",
  currencyCode: "USD",
  timezone: "America/Los_Angeles",
  accountInfo: { id: "SELLER1", type: "seller", marketplaceStringId: "ATVPDKIKX0DER" }
}

describe("Amazon Ads client", () => {
  it.each([
    { profiles: [], reason: "no_profiles" },
    { profiles: [{ ...profile, accountInfo: { ...profile.accountInfo, type: "vendor" } }], reason: "seller_mismatch" },
    { profiles: [{ ...profile, countryCode: "DE" }], reason: "unsupported_region" }
  ])("rejects $reason before requesting account mappings", async ({ profiles, reason }) => {
    const transport = vi.fn<typeof fetch>(async () => Response.json(profiles))
    const result = new AmazonAds(app, "access", transport).profiles("SELLER1")
    await expect(result).rejects.toBeInstanceOf(AdsProfileError)
    await expect(result).rejects.toMatchObject({ reason, received: profiles.length })
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it("asks for tokens with the Ads app's own credentials, form-encoded", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ access_token: "access" }))
    await expect(adsToken(app, { grant_type: "refresh_token", refresh_token: "r" }, transport)).resolves.toEqual({
      access_token: "access"
    })
    const [url, init] = transport.mock.calls[0]!
    expect(url).toBe("https://api.amazon.com/auth/o2/token")
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "r",
      client_id: "ads-client",
      client_secret: "ads-secret"
    })
    await expect(adsToken(app, {}, async () => new Response(null, { status: 401 }))).rejects.toMatchObject({
      status: 401,
      message: "Amazon Ads token http failure (401)"
    })
  })

  it("reads only the seller's North American profiles, each with its ads account", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json([
          profile,
          { ...profile, accountInfo: { ...profile.accountInfo, id: "OTHER" } },
          { ...profile, accountInfo: { ...profile.accountInfo, type: "vendor" } },
          { ...profile, countryCode: "DE" }
        ])
      )
      .mockResolvedValueOnce(
        Response.json({
          adsAccounts: [{ adsAccountId: "acct", alternateIds: [{ profileId: 1234, countryCode: "US" }] }]
        })
      )
    expect(await new AmazonAds(app, "access", transport).profiles("SELLER1")).toEqual([
      { ...profile, profileId: "1234", adsAccountId: "acct" }
    ])
    expect(transport.mock.calls[0]![1]?.headers).toMatchObject({
      Authorization: "Bearer access",
      "Amazon-Advertising-API-ClientId": "ads-client"
    })
  })

  it("rejects a profile in a time zone that doesn't exist", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json([{ ...profile, timezone: "Not/AZone" }]))
    await expect(new AmazonAds(app, "access", transport).profiles("SELLER1")).rejects.toThrow("timezone")
  })

  it("downloads gzipped reports only from Amazon's storage, and turns network failures into retryable errors", async () => {
    const rows = [
      {
        "date.value": "2026-10-01",
        "campaign.id": "c1",
        "campaign.country": "US",
        "adProduct.value": "Sponsored Products",
        "budgetCurrency.value": "USD",
        "metric.totalCost": 1.5
      }
    ]
    const transport = vi.fn<typeof fetch>(async () => new Response(gzipSync(JSON.stringify(rows))))
    expect(await downloadAdsReport("https://reports.s3.amazonaws.com/r", transport)).toEqual([
      {
        date: "2026-10-01",
        campaignId: "c1",
        country: "US",
        product: "SPONSORED_PRODUCTS",
        currency: "USD",
        cost: 1.5,
        sku: null
      }
    ])
    await expect(downloadAdsReport("https://example.com/r", transport)).rejects.toThrow("Unexpected")
    const offline = vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("fetch failed")))
    const failure = downloadAdsReport("https://reports.s3.amazonaws.com/r", offline)
    await expect(failure).rejects.toBeInstanceOf(AdsRequestError)
    await expect(failure).rejects.toMatchObject({ status: 503 })
  })
})
