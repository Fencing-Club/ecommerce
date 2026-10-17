import { and, eq, isNull, lt, gt, or, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { amazonProductMappings, connections } from "@/db/schema"
import { fbaReportMarketplace } from "./amazon-report-sync"
import { analyticsSnapshot } from "./analytics-snapshot"

const id = z.string().trim().min(1).max(512)
export const productMappingInput = z
  .object({
    externalAccountId: id,
    sku: id,
    asin: id.nullable().default(null),
    fnsku: id.nullable().default(null),
    shopifyDomain: id,
    variantId: id,
    validFrom: z.iso.datetime({ offset: true }),
    validTo: z.iso.datetime({ offset: true }),
    evidence: z.string().trim().min(1).max(2000),
    supersedes: z.uuid().optional()
  })
  .refine((row) => Date.parse(row.validFrom) < Date.parse(row.validTo), "Choose an increasing validity period")
export type HistoricalProductMapping = typeof amazonProductMappings.$inferSelect

export function historicalProductMatch(
  row: { sku: string | null; asin: string | null; fnsku: string | null; marketplaceId: string; occurredAt: string },
  mappings: HistoricalProductMapping[]
) {
  const time = new Date(row.occurredAt)
  const candidates = mappings.filter(
    (mapping) =>
      !mapping.retiredAt &&
      mapping.marketplaceId === row.marketplaceId &&
      mapping.validFrom <= time &&
      time < mapping.validTo &&
      ((row.sku !== null && mapping.sku === row.sku) ||
        (row.fnsku !== null && mapping.fnsku === row.fnsku) ||
        (row.asin !== null && mapping.asin === row.asin)) &&
      !(row.sku && row.sku !== mapping.sku) &&
      !(row.asin && mapping.asin && row.asin !== mapping.asin) &&
      !(row.fnsku && mapping.fnsku && row.fnsku !== mapping.fnsku)
  )
  let status = "unmapped"
  if (candidates.length === 1) {
    const mapping = candidates[0]!
    const hasSellerIdentity =
      (row.sku !== null && row.sku === mapping.sku) || (row.fnsku !== null && row.fnsku === mapping.fnsku)
    status = hasSellerIdentity ? "confirmed" : "insufficient_identifiers"
  } else if (candidates.length > 1) {
    status = "ambiguous"
  }
  return {
    status,
    candidates: candidates.map((mapping) => ({
      id: mapping.id,
      shopifyDomain: mapping.shopifyDomain,
      variantId: mapping.variantId,
      validFrom: mapping.validFrom,
      validTo: mapping.validTo,
      evidence: mapping.evidence
    }))
  }
}

export async function saveAmazonProductMapping(
  orgId: string,
  userId: string,
  input: z.infer<typeof productMappingInput>,
  requestId?: string
) {
  return db().transaction(async (tx) => {
    // All mapping writes for a seller serialize with disconnects and each other.
    const [account] = await tx
      .select()
      .from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.provider, "amazon")))
      .for("update")
    if (!account || account.externalId !== input.externalAccountId) {
      return { ok: false as const, reason: "amazon_account_changed" }
    }
    if (requestId) {
      const [existing] = await tx.select().from(amazonProductMappings).where(eq(amazonProductMappings.id, requestId))
      if (existing) {
        const same =
          existing.orgId === orgId &&
          existing.externalAccountId === account.externalId &&
          existing.createdBy === userId &&
          existing.sku === input.sku &&
          existing.asin === input.asin &&
          existing.fnsku === input.fnsku &&
          existing.shopifyDomain === input.shopifyDomain &&
          existing.variantId === input.variantId &&
          existing.validFrom.getTime() === Date.parse(input.validFrom) &&
          existing.validTo.getTime() === Date.parse(input.validTo) &&
          existing.evidence === input.evidence &&
          existing.supersedes === (input.supersedes ?? null)
        if (!same) {
          return { ok: false as const, reason: "idempotency_key_reused" }
        }
        return { ok: true as const, mapping: existing, replayed: true }
      }
    }
    const scope = and(
      eq(amazonProductMappings.orgId, orgId),
      eq(amazonProductMappings.externalAccountId, account.externalId),
      eq(amazonProductMappings.marketplaceId, fbaReportMarketplace)
    )
    const target =
      await tx.execute(sql`select 1 from variant_fields where "orgId"=${orgId} and "shopifyDomain"=${input.shopifyDomain} and "variantId"=${input.variantId}
      union all select 1 from stock_snapshots s where s."orgId"=${orgId} and s.source='shopify' and s."externalAccountId"=${input.shopifyDomain} and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(s.data->'rows')='array' then s.data->'rows' else '[]'::jsonb end) r where r->>'variantId'=${input.variantId}) limit 1`)
    if (!target.rows.length) {
      return { ok: false as const, reason: "target_not_in_workspace" }
    }
    if (input.supersedes) {
      const [old] = await tx
        .select()
        .from(amazonProductMappings)
        .where(and(scope, eq(amazonProductMappings.id, input.supersedes), isNull(amazonProductMappings.retiredAt)))
      if (!old) {
        return { ok: false as const, reason: "mapping_changed" }
      }
    }
    const overlaps = await tx
      .select({ id: amazonProductMappings.id })
      .from(amazonProductMappings)
      .where(
        and(
          scope,
          isNull(amazonProductMappings.retiredAt),
          lt(amazonProductMappings.validFrom, new Date(input.validTo)),
          gt(amazonProductMappings.validTo, new Date(input.validFrom)),
          or(
            eq(amazonProductMappings.sku, input.sku),
            input.fnsku ? eq(amazonProductMappings.fnsku, input.fnsku) : undefined
          )
        )
      )
    if (overlaps.some((row) => row.id !== input.supersedes)) {
      return { ok: false as const, reason: "overlapping_mapping" }
    }
    if (input.supersedes) {
      await tx
        .update(amazonProductMappings)
        .set({ retiredAt: new Date(), retiredBy: userId })
        .where(and(scope, eq(amazonProductMappings.id, input.supersedes)))
    }
    const [mapping] = await tx
      .insert(amazonProductMappings)
      .values({
        ...input,
        id: requestId,
        validFrom: new Date(input.validFrom),
        validTo: new Date(input.validTo),
        orgId,
        externalAccountId: account.externalId,
        marketplaceId: fbaReportMarketplace,
        createdBy: userId
      })
      .returning()
    return { ok: true as const, mapping, replayed: false }
  })
}
export async function listAmazonProductMappings(orgId: string, input: { page: number; snapshot?: string }) {
  return db().transaction(
    async (tx) => {
      const snapshot = await analyticsSnapshot(tx, orgId, input, "product-mappings")
      const [account] = await tx
        .select()
        .from(connections)
        .where(and(eq(connections.orgId, orgId), eq(connections.provider, "amazon")))
      if (!account) {
        return { mappings: [], hasMore: false, snapshot, page: input.page }
      }
      const rows = await tx
        .select()
        .from(amazonProductMappings)
        .where(
          and(
            eq(amazonProductMappings.orgId, orgId),
            eq(amazonProductMappings.externalAccountId, account.externalId),
            eq(amazonProductMappings.marketplaceId, fbaReportMarketplace)
          )
        )
        .orderBy(amazonProductMappings.validFrom, amazonProductMappings.id)
        .limit(101)
        .offset(input.page * 100)
      return { mappings: rows.slice(0, 100), hasMore: rows.length > 100, snapshot, page: input.page }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}
export async function getAmazonProductMapping(orgId: string, id: string) {
  const [row] = await db()
    .select({ mapping: amazonProductMappings })
    .from(amazonProductMappings)
    .innerJoin(
      connections,
      and(
        eq(connections.orgId, amazonProductMappings.orgId),
        eq(connections.provider, "amazon"),
        eq(connections.externalId, amazonProductMappings.externalAccountId)
      )
    )
    .where(
      and(
        eq(amazonProductMappings.orgId, orgId),
        eq(amazonProductMappings.id, id),
        eq(amazonProductMappings.marketplaceId, fbaReportMarketplace)
      )
    )
  return row?.mapping
}

export async function retireAmazonProductMapping(orgId: string, userId: string, id: string) {
  return db().transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.provider, "amazon")))
      .for("update")
    if (!account) {
      return false
    }
    const [existing] = await tx
      .select()
      .from(amazonProductMappings)
      .where(
        and(
          eq(amazonProductMappings.id, id),
          eq(amazonProductMappings.orgId, orgId),
          eq(amazonProductMappings.externalAccountId, account.externalId),
          eq(amazonProductMappings.marketplaceId, fbaReportMarketplace)
        )
      )
    if (!existing) {
      return false
    }
    if (existing.retiredAt) {
      return true
    }
    const rows = await tx
      .update(amazonProductMappings)
      .set({ retiredAt: new Date(), retiredBy: userId })
      .where(
        and(
          eq(amazonProductMappings.id, id),
          eq(amazonProductMappings.orgId, orgId),
          eq(amazonProductMappings.externalAccountId, account.externalId),
          isNull(amazonProductMappings.retiredAt)
        )
      )
      .returning({ id: amazonProductMappings.id })
    return rows.length === 1
  })
}
