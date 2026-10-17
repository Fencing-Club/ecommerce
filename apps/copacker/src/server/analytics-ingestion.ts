import { and, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { analyticsEvidence, analyticsFeeds, operatingCosts, connections, organizations } from "@/db/schema"
import { analyticsPagination } from "./analytics-contract"
import { analyticsSnapshot } from "./analytics-snapshot"
import { normalizeTags, taggedWith } from "./shopify-tags"
export const ingestionQuery = z.strictObject({
  ...analyticsPagination,
  source: z.enum(["amazon", "shopify"]),
  externalAccountId: z.string().min(1).max(200),
  dataset: z.enum([
    "order_economics",
    "fba_inbound_receipts",
    "awd_inbound_receipts",
    "fbm_returns",
    "awd_costs",
    "advertising_products"
  ])
})
export async function listIngestionEvidence(orgId: string, input: z.infer<typeof ingestionQuery>) {
  return db().transaction(
    async (tx) => {
      const snapshot = await analyticsSnapshot(
        tx,
        orgId,
        input,
        JSON.stringify([input.source, input.externalAccountId, input.dataset])
      )
      const [org] = await tx
        .select({ tags: organizations.excludedShopifyTags })
        .from(organizations)
        .where(eq(organizations.id, orgId))
      const rows = await tx
        .select()
        .from(analyticsEvidence)
        .where(
          and(
            eq(analyticsEvidence.orgId, orgId),
            eq(analyticsEvidence.source, input.source),
            eq(analyticsEvidence.externalAccountId, input.externalAccountId),
            eq(analyticsEvidence.dataset, input.dataset),
            input.source === "shopify"
              ? sql`not (${taggedWith(sql`${analyticsEvidence.data}`, normalizeTags(org?.tags ?? []))}) and coalesce(${analyticsEvidence.data}->>'test', 'false') <> 'true'`
              : undefined
          )
        )
        .orderBy(analyticsEvidence.sourceId)
        .limit(101)
        .offset(input.page * 100)
      return {
        rows: rows.slice(0, 100),
        snapshot,
        nextPage: rows.length > 100 ? input.page + 1 : null,
        basis: "source_evidence_not_additional_postings"
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}
export async function ingestionStatus(orgId: string) {
  const [feeds, accounts] = await Promise.all([
    db().select().from(analyticsFeeds).where(eq(analyticsFeeds.orgId, orgId)),
    db()
      .select({ provider: connections.provider, externalAccountId: connections.externalId })
      .from(connections)
      .where(eq(connections.orgId, orgId))
  ])
  return {
    feeds,
    accounts,
    missingFeedMeaning: "not_imported",
    limits: {
      shopify:
        "50 updated orders per resumable job page; earliest accessible history with read_all_orders, otherwise 60 days",
      inbound: "40 least recently checked shipments per network per sync; no inferred receipt dates",
      fbm: "12 completed months and current month; missing windows backfilled, recent months refreshed daily",
      advertising: "product detail is separate from total spend; see Amazon Ads jobs for failures"
    }
  }
}
export async function listOperatingCosts(orgId: string, input: z.infer<typeof costQuery>) {
  return db().transaction(
    async (tx) => {
      const snapshot = await analyticsSnapshot(tx, orgId, input, "operating_costs")
      const rows = await tx
        .select()
        .from(operatingCosts)
        .where(and(eq(operatingCosts.orgId, orgId), isNull(operatingCosts.retiredAt)))
        .orderBy(operatingCosts.id)
        .limit(101)
        .offset(input.page * 100)
      return { rows: rows.slice(0, 100), snapshot, nextPage: rows.length > 100 ? input.page + 1 : null }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}
export const costQuery = z.strictObject(analyticsPagination)
