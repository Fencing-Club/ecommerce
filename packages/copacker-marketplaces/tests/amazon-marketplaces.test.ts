import { describe, expect, it, vi } from "vitest"
import { exchangeAmazonCode, ProviderError, salesMarketplaceIds } from "../src/amazon"
import { amazonConsentUrl, amazonMarketplace, amazonMarketplaces, usMarketplaceId } from "../src/amazon-marketplaces"

describe("Amazon marketplaces", () => {
  it("lists the North American marketplaces once, the US first", () => {
    expect(amazonMarketplaces.map((marketplace) => marketplace.country)).toEqual(["US", "CA", "MX", "BR"])
    expect(salesMarketplaceIds).toEqual(amazonMarketplaces.map((marketplace) => marketplace.id))
    expect(amazonMarketplace("US").id).toBe(usMarketplaceId)
    expect(amazonMarketplace("MX")).toMatchObject({ code: "mx", label: "Amazon Mexico", salesChannel: "Amazon.com.mx" })
  })

  it("sends a seller to their marketplace's Seller Central to authorize the app", () => {
    const url = amazonConsentUrl({
      marketplace: "CA",
      applicationId: "amzn1.sp.solution.test",
      state: "nonce",
      callback: "https://copacker.ai/api/connections/amazon",
      draft: true
    })
    expect(url.origin).toBe("https://sellercentral.amazon.ca")
    expect(url.pathname).toBe("/apps/authorize/consent")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      application_id: "amzn1.sp.solution.test",
      state: "nonce",
      redirect_uri: "https://copacker.ai/api/connections/amazon",
      version: "beta"
    })
    expect(
      amazonConsentUrl({
        marketplace: "US",
        applicationId: "a",
        state: "s",
        callback: "c",
        draft: false
      }).searchParams.has("version")
    ).toBe(false)
    expect(() =>
      amazonConsentUrl({ marketplace: "DE", applicationId: "a", state: "s", callback: "c", draft: false })
    ).toThrow("expected one of")
  })
})

describe("Amazon authorization", () => {
  const app = { clientId: "client", clientSecret: "secret" }
  it("trades the Seller Central code for the seller's refresh token", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ refresh_token: "Atzr|refresh" }))
    await expect(exchangeAmazonCode(app, "code", "https://copacker.ai/callback", transport)).resolves.toBe(
      "Atzr|refresh"
    )
    const [url, init] = transport.mock.calls[0]!
    expect(url).toBe("https://api.amazon.com/auth/o2/token")
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      grant_type: "authorization_code",
      code: "code",
      client_id: "client",
      client_secret: "secret",
      redirect_uri: "https://copacker.ai/callback"
    })
  })
  it("reports a rejected code with its status", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ error: "invalid_grant" }, { status: 400 }))
    const failure = exchangeAmazonCode(app, "code", "https://copacker.ai/callback", transport)
    await expect(failure).rejects.toBeInstanceOf(ProviderError)
    await expect(failure).rejects.toMatchObject({ status: 400 })
  })
})
