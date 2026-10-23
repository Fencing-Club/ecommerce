import { randomUUID } from "node:crypto"
import { AdsRequestError, adsToken, AmazonAds, downloadAdsReport } from "@repo/copacker-marketplaces/amazon-ads"
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm"
import { db } from "@/db"
import { excluded } from "@/db/helpers"
import { amazonAdsConnections, amazonAdsDays, jobs, analyticsEvidence } from "@/db/schema"
import { addDays, zonedDay } from "@/lib/time-zone"
import { withJobWake } from "@/server/job-delivery"
import { amazonAdsApp } from "./connections"
import { syncExchangeRates } from "./exchange-rates"
import { jobRow, type JobInput } from "./job-payloads"
import { PollAgain, type JobContext } from "./job-runtime"
import { connectedAccount } from "./provider-accounts"
import { decrypt, encrypt } from "./security"

const connectionScope = (orgId: string) => eq(amazonAdsConnections.orgId, orgId)
export async function saveAdsConnection(orgId: string, sellerId: string, refreshToken: string, ads: AmazonAds) {
  const profiles = await ads.profiles(sellerId)
  await db().transaction(async (tx) => {
    const seller = await connectedAccount(orgId, "amazon", { executor: tx, lock: "update" })
    if (seller?.externalId !== sellerId) {
      throw new Error("Amazon seller connection changed")
    }
    const values = {
      orgId,
      sellerId,
      profiles,
      generation: randomUUID(),
      encryptedToken: encrypt(refreshToken, `${orgId}:amazon-ads`)
    }
    await tx
      .insert(amazonAdsConnections)
      .values(values)
      .onConflictDoUpdate({ target: amazonAdsConnections.orgId, set: values })
  })
}

export async function queueAdsSync(orgId: string, now = new Date()) {
  return withJobWake(
    db().transaction(async (tx) => {
      const [grant] = await tx.select().from(amazonAdsConnections).where(connectionScope(orgId)).for("update")
      if (!grant) {
        return []
      }
      // A manual retry can restart failed work, but never race an active generation.
      const active = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.kind, "amazon-ads"),
            sql`${jobs.payload}->>'orgId' = ${orgId}`,
            sql`${jobs.payload}->>'generation' = ${grant.generation}`,
            inArray(jobs.status, ["pending", "running"])
          )
        )
      if (active.length) {
        return active.map((job) => job.id)
      }
      await tx
        .delete(jobs)
        .where(
          and(
            eq(jobs.kind, "amazon-ads"),
            eq(jobs.status, "failed"),
            sql`${jobs.payload}->>'orgId' = ${orgId}`,
            sql`${jobs.payload}->>'generation' = ${grant.generation}`
          )
        )
      const run = randomUUID()
      const work: (typeof jobs.$inferInsert)[] = []
      for (const profile of grant.profiles) {
        const end = zonedDay(now, profile.timezone)
        // A single small daily-spend report stays below the 120-day range limit and avoids concurrent reports per advertiser.
        const from = addDays(end, -89)
        work.push(
          jobRow("amazon-ads", `amazon-ads:${run}:${profile.profileId}:${from}`, {
            orgId,
            generation: grant.generation,
            profileId: profile.profileId,
            from,
            to: end
          })
        )
      }
      if (work.length) {
        const inserted = await tx.insert(jobs).values(work).returning({ id: jobs.id })
        return inserted.map((job) => job.id)
      }
      return []
    })
  )
}
export async function amazonAdsJob(input: JobInput<"amazon-ads">, { assertOwned }: Pick<JobContext, "assertOwned">) {
  const { orgId, generation, profileId, from, to } = input
  await assertOwned()
  const scope = and(connectionScope(orgId), eq(amazonAdsConnections.generation, generation))
  const [grant] = await db().select().from(amazonAdsConnections).where(scope)
  if (!grant) {
    return
  }
  const seller = await connectedAccount(orgId, "amazon")
  if (seller?.externalId !== grant.sellerId) {
    return
  }
  const profile = grant.profiles.find((p) => p.profileId === profileId)
  if (!profile) {
    throw new Error("Amazon Ads profile changed")
  }
  try {
    const app = amazonAdsApp()
    if (!app) {
      throw new Error("Amazon Ads application is not configured")
    }
    const token = await adsToken(app, {
      grant_type: "refresh_token",
      refresh_token: decrypt(grant.encryptedToken, `${orgId}:amazon-ads`)
    })
    if (token.refresh_token) {
      await db()
        .update(amazonAdsConnections)
        .set({ encryptedToken: encrypt(token.refresh_token, `${orgId}:amazon-ads`) })
        .where(scope)
    }
    const ads = new AmazonAds(app, token.access_token)
    if (!input.reportId) {
      const reportId = await ads.createReport(profile, from, to, input.productDetail)
      throw new PollAgain("Amazon Ads report requested", {
        payload: { ...input, reportId },
        delayMs: 60000,
        progressed: true
      })
    }
    const report = await ads.report(input.reportId)
    if (report.status === "FAILED") {
      throw new Error("Amazon Ads report generation failed")
    }
    if (report.status !== "COMPLETED") {
      throw new PollAgain("Waiting for Amazon Ads report", { delayMs: 300000 })
    }
    if (!report.completedReportParts?.length) {
      throw new Error("Amazon Ads report download is missing")
    }
    const totals = new Map<string, number>()
    for (let day = from; day <= to; day = addDays(day, 1)) {
      totals.set(day, 0)
    }
    const details: {
      date: string
      campaignId: string
      product: string
      sku: string | null
      cost: number
      currency: string
    }[] = []
    const seen = new Set<string>()
    for (const part of report.completedReportParts) {
      for (const row of await downloadAdsReport(part.url)) {
        const products = input.productDetail
          ? ["SPONSORED_PRODUCTS", "SPONSORED_DISPLAY"]
          : ["SPONSORED_PRODUCTS", "SPONSORED_BRANDS", "SPONSORED_DISPLAY"]
        const mismatches = [
          ...(!totals.has(row.date) ? ["date"] : []),
          ...(row.country !== profile.countryCode ? ["country"] : []),
          ...(row.currency !== profile.currencyCode ? ["currency"] : []),
          ...(!products.includes(row.product) ? ["ad product"] : [])
        ]
        if (mismatches.length) {
          // Report only field names, never source values, signed URLs or campaign identifiers.
          throw new Error(`Amazon Ads report is outside the requested scope: ${mismatches.join(", ")}`)
        }
        const key = JSON.stringify([row.date, row.product, row.campaignId, ...(input.productDetail ? [row.sku] : [])])
        if (seen.has(key)) {
          throw new Error("Duplicate campaign in Amazon Ads report")
        }
        seen.add(key)
        if (input.productDetail) {
          details.push(row)
        }
        const micros = Math.round(row.cost * 1000000) + totals.get(row.date)!
        if (!Number.isSafeInteger(micros)) {
          throw new Error("Amazon Ads spend exceeds supported precision")
        }
        totals.set(row.date, micros)
      }
    }
    await assertOwned()
    await db().transaction(async (tx) => {
      const sellerNow = await connectedAccount(orgId, "amazon", { executor: tx, lock: "update" })
      if (sellerNow?.externalId !== grant.sellerId) {
        return
      }
      const [current] = await tx.select().from(amazonAdsConnections).where(scope).for("update")
      if (!current) {
        return
      }
      if (input.productDetail) {
        for (const day of totals.keys()) {
          await tx
            .insert(analyticsEvidence)
            .values({
              orgId,
              source: "amazon",
              externalAccountId: grant.sellerId,
              dataset: "advertising_products",
              sourceId: `${profileId}:${day}`,
              data: {
                profileId,
                day,
                currency: profile.currencyCode,
                marketplaceId: profile.accountInfo.marketplaceStringId,
                rows: details.filter((r) => r.date === day),
                sharedSpend: "Sponsored Brands and unmatched SKU spend remain unallocated",
                accountingBasis: "detail_of_advertising_spend"
              }
            })
            .onConflictDoUpdate({
              target: [
                analyticsEvidence.orgId,
                analyticsEvidence.source,
                analyticsEvidence.externalAccountId,
                analyticsEvidence.dataset,
                analyticsEvidence.sourceId
              ],
              set: { ...excluded(analyticsEvidence, "data"), observedAt: new Date() }
            })
        }
        return
      }
      await tx
        .insert(amazonAdsDays)
        .values(
          [...totals].map(([day, micros]) => ({
            orgId,
            sellerId: grant.sellerId,
            profileId,
            marketplaceId: profile.accountInfo.marketplaceStringId,
            currency: profile.currencyCode,
            day,
            cost: (micros / 1000000).toFixed(6),
            syncedAt: new Date()
          }))
        )
        .onConflictDoUpdate({
          target: [amazonAdsDays.orgId, amazonAdsDays.sellerId, amazonAdsDays.profileId, amazonAdsDays.day],
          set: excluded(amazonAdsDays, "cost", "currency", "syncedAt")
        })
    })
    await syncExchangeRates(orgId)
    if (!input.productDetail) {
      throw new PollAgain("Collecting product advertising costs", {
        payload: { ...input, productDetail: true, reportId: undefined },
        delayMs: 60000,
        progressed: true
      })
    }
  } catch (error) {
    if (error instanceof AdsRequestError && (error.status === 429 || error.status >= 500)) {
      throw new PollAgain(error.message, { delayMs: 60000 })
    }
    throw error
  }
}

// Use one measurement basis for the whole requested period. Never add daily spend to the payment for those ads.
// Older or incomplete periods keep the existing posted-payment figure, including while a first sync is running.
export async function adsCharge(
  orgId: string,
  sellerId: string,
  marketplaceId: string | undefined,
  from: Date,
  to: Date,
  currency: string
): Promise<number | null> {
  const [grant] = await db()
    .select()
    .from(amazonAdsConnections)
    .where(and(connectionScope(orgId), eq(amazonAdsConnections.sellerId, sellerId)))
  if (!grant) {
    return null
  }
  const profiles = grant.profiles.filter((p) => !marketplaceId || p.accountInfo.marketplaceStringId === marketplaceId)
  if (!profiles.length) {
    return null
  }
  let minor = 0
  for (const profile of profiles) {
    const start = zonedDay(from, profile.timezone),
      end = zonedDay(new Date(to.getTime() - 1), profile.timezone)
    const expected = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1
    const [result] = await db()
      .select({
        days: sql<number>`count(*)::int`,
        priced: sql<number>`count(fx_rate(${amazonAdsDays.currency}, ${currency}, ${amazonAdsDays.day}::timestamptz))::int`,
        minor: sql<string>`round(sum(${amazonAdsDays.cost} * 100 * fx_rate(${amazonAdsDays.currency}, ${currency}, ${amazonAdsDays.day}::timestamptz)))::text`
      })
      .from(amazonAdsDays)
      .where(
        and(
          eq(amazonAdsDays.orgId, orgId),
          eq(amazonAdsDays.sellerId, sellerId),
          eq(amazonAdsDays.profileId, profile.profileId),
          gte(amazonAdsDays.day, start),
          lte(amazonAdsDays.day, end)
        )
      )
    if (!result || result.days !== expected || result.priced !== expected) {
      return null
    }
    minor -= Number(result.minor)
  }
  return minor
}
export async function adsStatus(orgId: string) {
  const [grant] = await db()
    .select({ sellerId: amazonAdsConnections.sellerId, generation: amazonAdsConnections.generation })
    .from(amazonAdsConnections)
    .where(connectionScope(orgId))
  if (!grant) {
    return { connected: false, active: false, failed: false }
  }
  const seller = await connectedAccount(orgId, "amazon")
  if (seller?.externalId !== grant.sellerId) {
    return { connected: false, active: false, failed: false }
  }
  const work = await db()
    .select({ status: jobs.status })
    .from(jobs)
    .where(
      and(
        eq(jobs.kind, "amazon-ads"),
        sql`${jobs.payload}->>'orgId' = ${orgId}`,
        sql`${jobs.payload}->>'generation' = ${grant.generation}`
      )
    )
  const active = work.some((job) => job.status === "pending" || job.status === "running")
  return { connected: true, active, failed: !active && work.some((job) => job.status === "failed") }
}
export async function disconnectAds(orgId: string) {
  await db().delete(amazonAdsConnections).where(connectionScope(orgId))
}
