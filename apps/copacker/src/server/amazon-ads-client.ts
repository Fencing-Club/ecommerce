import { gunzipSync } from "node:zlib"
import { z } from "zod"
import { isTimeZone } from "@/lib/time-zone"

const api = "https://advertising-api.amazon.com"
export const adsScope = "advertising::campaign_management"
const identifier = z
  .union([z.string().regex(/^\d+$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)])
  .transform(String)
const profileSchema = z.object({
  profileId: identifier,
  countryCode: z.string(),
  currencyCode: z.string().length(3),
  timezone: z.string().refine(isTimeZone),
  accountInfo: z.object({
    id: z.string(),
    type: z.string(),
    marketplaceStringId: z.string(),
    name: z.string().optional()
  })
})
export type AdsProfile = z.infer<typeof profileSchema> & { adsAccountId: string }
const adProducts = ["SPONSORED_PRODUCTS", "SPONSORED_BRANDS", "SPONSORED_DISPLAY"]
const reportResponse = z.object({
  error: z.array(z.object({ errors: z.array(z.object({ code: z.string() })) })).nullish(),
  success: z
    .array(
      z.object({
        report: z.object({
          reportId: z.string().min(1),
          status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]),
          completedReportParts: z.array(z.object({ url: z.url() })).optional(),
          warnings: z.array(z.unknown()).optional()
        })
      })
    )
    .nullish()
})
function readReport(value: unknown) {
  const response = reportResponse.parse(value)
  const errors = response.error?.flatMap((item) => item.errors) ?? []
  if (errors.length) {
    if (errors.some((error) => error.code === "TOO_MANY_REQUESTS")) {
      throw new AdsRequestError(429)
    }
    if (errors.some((error) => error.code === "INTERNAL_ERROR")) {
      throw new AdsRequestError(500)
    }
    throw new Error("Amazon Ads report request was rejected")
  }
  const report = response.success?.[0]?.report
  if (!report || report.warnings?.length) {
    throw new Error("Amazon Ads report is incomplete")
  }
  return report
}
export function amazonAdsApp() {
  const { AMAZON_ADS_CLIENT_ID, AMAZON_ADS_CLIENT_SECRET } = process.env
  return AMAZON_ADS_CLIENT_ID && AMAZON_ADS_CLIENT_SECRET
    ? { clientId: AMAZON_ADS_CLIENT_ID, clientSecret: AMAZON_ADS_CLIENT_SECRET }
    : null
}
export class AdsRequestError extends Error {
  constructor(readonly status: number) {
    super(`Amazon Ads request failed (${status})`)
  }
}
// Normalize transport failures so the durable worker retries without logging request credentials.
async function adsFetch(input: string | URL, init: RequestInit) {
  try {
    return await fetch(input, init)
  } catch {
    throw new AdsRequestError(503)
  }
}
export async function adsToken(grant: Record<string, string>) {
  const app = amazonAdsApp()
  if (!app) {
    throw new Error("Amazon Ads application is not configured")
  }
  const response = await adsFetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...grant, client_id: app.clientId, client_secret: app.clientSecret }),
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    throw new AdsRequestError(response.status)
  }
  return z
    .object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional() })
    .parse(await response.json())
}
export class AmazonAds {
  constructor(private readonly accessToken: string) {}
  private async request(path: string, body?: unknown, contentType = "application/json"): Promise<unknown> {
    const app = amazonAdsApp()
    if (!app) {
      throw new Error("Amazon Ads application is not configured")
    }
    const response = await adsFetch(`${api}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Amazon-Advertising-API-ClientId": app.clientId,
        "Amazon-Ads-ClientId": app.clientId,
        Accept: contentType,
        ...(body ? { "Content-Type": contentType } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) {
      throw new AdsRequestError(response.status)
    }
    return response.json()
  }
  async profiles(sellerId: string): Promise<AdsProfile[]> {
    const profiles = z
      .array(profileSchema)
      .parse(await this.request("/v2/profiles?accessLevel=view"))
      .filter(
        (p) =>
          p.accountInfo.type === "seller" &&
          p.accountInfo.id === sellerId &&
          ["US", "CA", "MX", "BR"].includes(p.countryCode)
      )
    if (!profiles.length) {
      return []
    }
    const accountSchema = z.object({
      adsAccountId: z.string().min(1),
      alternateIds: z
        .array(z.object({ profileId: identifier.optional(), countryCode: z.string().optional() }))
        .default([])
    })
    const accounts: z.infer<typeof accountSchema>[] = []
    const seen = new Set<string>()
    let nextToken: string | undefined
    do {
      const page = z
        .object({ adsAccounts: z.array(accountSchema), nextToken: z.string().nullish() })
        .parse(
          await this.request(
            "/adsAccounts/list",
            { maxResults: 100, ...(nextToken ? { nextToken } : {}) },
            "application/vnd.listaccountsresource.v1+json"
          )
        )
      accounts.push(...page.adsAccounts)
      nextToken = page.nextToken || undefined
      if (nextToken) {
        if (seen.has(nextToken) || seen.size >= 100) {
          throw new Error("Amazon Ads account pagination did not finish")
        }
        seen.add(nextToken)
      }
    } while (nextToken)
    return profiles.map((profile) => {
      const matches = accounts.filter((account) =>
        account.alternateIds.some((id) => id.profileId === profile.profileId && id.countryCode === profile.countryCode)
      )
      if (matches.length !== 1) {
        throw new Error("Amazon Ads account mapping is unavailable")
      }
      return { ...profile, adsAccountId: matches[0]!.adsAccountId }
    })
  }
  async createReport(profile: AdsProfile, from: string, to: string) {
    return readReport(
      await this.request("/adsApi/v1/create/reports", {
        accessRequestedAccounts: [{ advertiserAccountId: profile.adsAccountId }],
        reports: [
          {
            format: "GZIP_JSON",
            periods: [{ datePeriod: { startDate: from, endDate: to } }],
            query: {
              fields: [
                "date.value",
                "campaign.id",
                "campaign.country",
                "adProduct.value",
                "budgetCurrency.value",
                "metric.totalCost"
              ],
              filter: {
                and: {
                  filters: [
                    {
                      on: {
                        field: "campaign.country",
                        comparisonOperator: "EQUALS",
                        not: false,
                        values: [profile.countryCode]
                      }
                    },
                    { on: { field: "adProduct.value", comparisonOperator: "IN", not: false, values: adProducts } }
                  ]
                }
              }
            }
          }
        ]
      })
    ).reportId
  }
  async report(reportId: string) {
    const report = readReport(await this.request("/adsApi/v1/retrieve/reports", { reportIds: [reportId] }))
    if (report.reportId !== reportId) {
      throw new Error("Amazon Ads returned a different report")
    }
    return report
  }
}

const reportRows = z.array(
  z
    .object({
      "date.value": z.iso.date(),
      "campaign.id": z.string().min(1),
      "campaign.country": z.string(),
      "adProduct.value": z.string(),
      "budgetCurrency.value": z.string().length(3),
      "metric.totalCost": z.number().finite().nonnegative()
    })
    .transform((row) => ({
      date: row["date.value"],
      campaignId: row["campaign.id"],
      country: row["campaign.country"],
      product: row["adProduct.value"],
      currency: row["budgetCurrency.value"],
      cost: row["metric.totalCost"]
    }))
)
export async function downloadAdsReport(url: string) {
  const location = new URL(url)
  if (
    location.protocol !== "https:" ||
    !location.hostname.endsWith(".amazonaws.com") ||
    location.username ||
    location.password
  ) {
    throw new Error("Unexpected Amazon Ads report location")
  }
  // Signed report downloads must never receive the Ads token or client secret.
  const response = await adsFetch(location, { redirect: "error", signal: AbortSignal.timeout(60000) })
  if (!response.ok) {
    throw new AdsRequestError(response.status)
  }
  const limit = 32 * 1024 * 1024
  if (!response.body) {
    throw new Error("Empty Amazon Ads report")
  }
  const chunks: Uint8Array[] = []
  let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.length
    if (bytes > limit) {
      throw new Error("Amazon Ads report exceeds download limit")
    }
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)
  const decoded = buffer[0] === 0x1f && buffer[1] === 0x8b ? gunzipSync(buffer, { maxOutputLength: limit }) : buffer
  return reportRows.parse(JSON.parse(decoded.toString("utf8")))
}
