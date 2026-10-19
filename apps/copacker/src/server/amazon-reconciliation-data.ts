import { and, eq, desc, sql, inArray, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import {
  amazonTransactions,
  amazonReimbursements,
  amazonReimbursementReports,
  amazonProductMappings,
  connections,
  salesSyncs,
  stockSnapshots
} from "@/db/schema"
import { historicalProductMatch } from "./amazon-product-mappings"
import { preferredPostingType, reconcileAmazonEvidence } from "./amazon-reconciliation"
import { reimbursementAccounting } from "./amazon-reimbursement-accounting"
import { fbaReportMarketplace } from "./amazon-report-sync"
import { analyticsPagination } from "./analytics-contract"
import { importedProductCatalog, importedProductMatch } from "./analytics-product-evidence"
import { analyticsSnapshot } from "./analytics-snapshot"

export const reconciliationInput = z
  .object({
    source: z.enum(["returns", "reimbursements", "movements", "storage", "removals"]),
    from: z.iso.date(),
    to: z.iso.date(),
    ...analyticsPagination,
    postingPage: z.coerce.number().int().min(0).max(10000).optional(),
    candidatePage: z.coerce.number().int().min(0).max(249).optional()
  })
  .refine(
    (value) =>
      Date.parse(value.to) > Date.parse(value.from) && Date.parse(value.to) - Date.parse(value.from) <= 31 * 86400000,
    "Choose an increasing window of at most 31 days"
  )
const evidence = z.object({
  id: z.string(),
  source: z.string(),
  occurredAt: z.coerce.date().transform((date) => date.toISOString()),
  marketplaceId: z.string(),
  sku: z.string().nullable(),
  asin: z.string().nullable(),
  fnsku: z.string().nullable(),
  orderId: z.string().nullable(),
  currency: z.string().nullable(),
  amount: z.string().nullable(),
  reimbursement: z
    .object({
      id: z.string(),
      reason: z.string().nullable(),
      quantityCash: z.number().nullable(),
      quantityInventory: z.number().nullable(),
      quantityTotal: z.number().nullable(),
      originalId: z.string().nullable(),
      originalType: z.string().nullable()
    })
    .optional()
})
const inventorySnapshot = z.object({
  source: z.literal("fba"),
  scopeKey: z.string(),
  observedAt: z.string(),
  rows: z.array(z.object({ sellerSku: z.string(), asin: z.string().optional(), fnSku: z.string().optional() }))
})
const pageSize = 100
const postingLimit = 5000

// Derived on demand from a consistent local snapshot. No external calls, writes or stale persisted row links.
export async function amazonReconciliation(orgId: string, input: z.infer<typeof reconciliationInput>) {
  return db().transaction(
    async (tx) => {
      const snapshot = await analyticsSnapshot(
        tx,
        orgId,
        { ...input, page: Math.max(input.page, input.postingPage ?? 0, input.candidatePage ?? 0) },
        JSON.stringify(["reconciliation", input.from, input.to, input.source])
      )
      const [account] = await tx
        .select({ externalId: connections.externalId })
        .from(connections)
        .where(and(eq(connections.orgId, orgId), eq(connections.provider, "amazon")))
      if (!account) {
        return { snapshot, connected: false, rows: [], hasMore: false }
      }
      const externalAccountId = account.externalId,
        marketplaceId = fbaReportMarketplace
      const scope = sql`"orgId"=${orgId} and "externalAccountId"=${externalAccountId} and "marketplaceId"=${marketplaceId}`
      const sources = {
        returns: sql`select id, 'returns' as source, "returnedAt" as "occurredAt", "marketplaceId", sku, asin, fnsku, "orderId", null::text as currency, null::text as amount from amazon_returns where ${scope}`,
        reimbursements: sql`select id, 'reimbursements' as source, "approvedAt" as "occurredAt", "marketplaceId", sku, asin, fnsku, "orderId", currency, "amountTotal"::text as amount, jsonb_build_object('id',"reimbursementId",'reason',reason,'quantityCash',"quantityCash",'quantityInventory',"quantityInventory",'quantityTotal',"quantityTotal",'originalId',"originalReimbursementId",'originalType',"originalReimbursementType") as reimbursement from amazon_reimbursements where ${scope}`,
        movements: sql`select id, 'movements' as source, ("eventDay"::timestamp at time zone 'UTC') as "occurredAt", "marketplaceId", sku, asin, fnsku, null::text as "orderId", null::text as currency, null::text as amount from amazon_inventory_movements where ${scope}`,
        storage: sql`select id, 'storage:' || kind as source, ("periodDay"::timestamp at time zone 'UTC') as "occurredAt", "marketplaceId", sku, asin, fnsku, null::text as "orderId", currency, amount::text from amazon_storage_fees where ${scope}`,
        removals: sql`select id, 'removals:' || kind as source, case when kind='orders' then "requestedAt" else "shippedAt" end as "occurredAt", "marketplaceId", sku, null::text as asin, fnsku, "orderId", currency, "removalFee"::text as amount from amazon_removals where ${scope}`
      }
      const result = await tx.execute(
        sql`select * from (${sources[input.source]}) evidence where "occurredAt">=${`${input.from}T00:00:00Z`}::timestamptz and "occurredAt"<${`${input.to}T00:00:00Z`}::timestamptz order by "occurredAt" desc,id limit ${pageSize + 1} offset ${input.page * pageSize}`
      )
      const rows = z.array(evidence).parse(result.rows)
      const catalogs = await importedProductCatalog(tx, orgId)
      const pageRows = rows.slice(0, pageSize)
      const reimbursementIds = pageRows.flatMap((row) => (row.reimbursement ? [row.reimbursement.id] : []))
      const originalIds = pageRows.flatMap((row) =>
        row.reimbursement?.originalId ? [row.reimbursement.originalId] : []
      )
      const relatedReimbursements = await reimbursementFamily(
        tx,
        orgId,
        externalAccountId,
        marketplaceId,
        [...reimbursementIds, ...originalIds],
        pageRows.filter((row) => row.reimbursement).map((row) => row.id)
      )
      const reimbursementCoverage =
        input.source === "reimbursements"
          ? await tx
              .select({
                from: amazonReimbursementReports.from,
                coveredTo: amazonReimbursementReports.coveredTo,
                requestedTo: amazonReimbursementReports.requestedTo,
                status: amazonReimbursementReports.status,
                errorCode: amazonReimbursementReports.errorCode
              })
              .from(amazonReimbursementReports)
              .where(
                and(
                  eq(amazonReimbursementReports.orgId, orgId),
                  eq(amazonReimbursementReports.externalAccountId, externalAccountId),
                  eq(amazonReimbursementReports.marketplaceId, marketplaceId)
                )
              )
              .orderBy(amazonReimbursementReports.from)
          : []
      const identifiers = (key: "orderId" | "sku" | "asin") => [
        ...new Set(pageRows.map((row) => row[key]).filter((value) => value !== null))
      ]
      const orders = sql.param(identifiers("orderId"))
      const orderMatch = sql`(${amazonTransactions.orderId}=any(${orders}::text[]) or exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(${amazonTransactions.data}->'relatedIdentifiers')='array' then ${amazonTransactions.data}->'relatedIdentifiers' else '[]'::jsonb end) ref
        where ref->>'relatedIdentifierName'='ORDER_ID' and ref->>'relatedIdentifierValue'=any(${orders}::text[])
      ))`
      // Filter before bounding the search: recent unrelated postings must not hide historical order evidence.
      const productMatch = sql`(
        jsonb_path_query_array(${amazonTransactions.data}, '$.items[*].contexts[*] ? (@.contextType == "ProductContext").sku') ?| ${sql.param(identifiers("sku"))}::text[]
        or jsonb_path_query_array(${amazonTransactions.data}, '$.items[*].contexts[*] ? (@.contextType == "ProductContext").asin') ?| ${sql.param(identifiers("asin"))}::text[]
      )`
      const postings = await tx
        .select()
        .from(amazonTransactions)
        .where(
          and(
            eq(amazonTransactions.orgId, orgId),
            eq(amazonTransactions.externalAccountId, externalAccountId),
            sql`(${orderMatch} or ${productMatch})`,
            sql`coalesce(nullif(${amazonTransactions.data}->'marketplaceDetails'->>'marketplaceId', ''), ${marketplaceId})=${marketplaceId}`
          )
        )
        .orderBy(
          sql`case when ${orderMatch} then 0 else 1 end`,
          sql`case when ${amazonTransactions.type}=${preferredPostingType(input.source)} then 0 else 1 end`,
          sql`case when ${amazonTransactions.postedAt} < ${`${input.from}T00:00:00Z`}::timestamptz then extract(epoch from (${`${input.from}T00:00:00Z`}::timestamptz - ${amazonTransactions.postedAt})) when ${amazonTransactions.postedAt} >= ${`${input.to}T00:00:00Z`}::timestamptz then extract(epoch from (${amazonTransactions.postedAt} - ${`${input.to}T00:00:00Z`}::timestamptz)) else 0 end`,
          desc(amazonTransactions.postedAt),
          amazonTransactions.transactionId
        )
        .limit(postingLimit + 1)
        .offset((input.postingPage ?? 0) * postingLimit)
      const mappings = await tx
        .select()
        .from(amazonProductMappings)
        .where(
          and(
            eq(amazonProductMappings.orgId, orgId),
            eq(amazonProductMappings.externalAccountId, externalAccountId),
            eq(amazonProductMappings.marketplaceId, marketplaceId)
          )
        )
      const [stock] = await tx
        .select()
        .from(stockSnapshots)
        .where(
          and(
            eq(stockSnapshots.orgId, orgId),
            eq(stockSnapshots.source, "fba"),
            eq(stockSnapshots.externalAccountId, externalAccountId),
            eq(stockSnapshots.scopeKey, marketplaceId)
          )
        )
      const parsed = inventorySnapshot.safeParse(stock?.data)
      const inventory = parsed.success && parsed.data.scopeKey === marketplaceId ? parsed.data : null
      const [sync] = await tx
        .select({
          from: salesSyncs.feesCoveredFrom,
          to: salesSyncs.feesCoveredTo,
          errorCode: salesSyncs.feesErrorCode,
          status: salesSyncs.status
        })
        .from(salesSyncs)
        .where(
          and(
            eq(salesSyncs.orgId, orgId),
            eq(salesSyncs.source, "amazon"),
            eq(salesSyncs.externalAccountId, externalAccountId)
          )
        )
      const reportTables = {
        returns: sql`amazon_return_reports`,
        reimbursements: sql`amazon_reimbursement_reports`,
        movements: sql`amazon_movement_reports`,
        storage: sql`amazon_storage_fee_reports`,
        removals: sql`amazon_removal_reports`
      }
      const kind = input.source === "storage" || input.source === "removals" ? sql`kind` : sql`null::text`
      const coverage = await tx.execute(
        sql`select ${kind} as kind,"from","requestedTo","coveredTo",status,"errorCode","rowCount","checkedAt","importedAt" from ${reportTables[input.source]} where ${scope} and "from"<${`${input.to}T00:00:00Z`}::timestamptz and "requestedTo">${`${input.from}T00:00:00Z`}::timestamptz order by "from",kind`
      )
      return {
        snapshot,
        connected: true,
        externalAccountId,
        marketplaceId,
        window: { from: input.from, to: input.to },
        source: input.source,
        relatedReimbursements: relatedReimbursements.rows,
        relatedReimbursementsTruncated: relatedReimbursements.truncated,
        reimbursementCoverage:
          input.source === "reimbursements"
            ? {
                windows: reimbursementCoverage,
                missingOriginalDate: "unknown",
                missingOriginalCause: "undetermined_without_original_date",
                boundsMeaning: "stored_report_windows_not_provider_retention"
              }
            : null,
        page: input.page,
        hasMore: rows.length > pageSize,
        rows: reconcileAmazonEvidence(
          pageRows,
          inventory?.rows.map((row) => ({ sku: row.sellerSku, asin: row.asin ?? null, fnsku: row.fnSku ?? null })) ??
            [],
          postings.slice(0, postingLimit),
          input.candidatePage ?? 0
        ).map((row) => ({
          ...row,
          reimbursement: pageRows.find((source) => source.id === row.id)?.reimbursement ?? null,
          reimbursementAccounting: (() => {
            const source = relatedReimbursements.rows.find((record) => record.sourceRowId === row.id)
            return source
              ? reimbursementAccounting(source, relatedReimbursements.rows, relatedReimbursements.truncated)
              : null
          })(),
          historicalProduct: historicalProductMatch(row, mappings),
          currentCatalogProduct: importedProductMatch(row.sku, catalogs)
        })),
        coverage: {
          reports: coverage.rows,
          finances: sync ?? null,
          financialSearch: {
            limit: postingLimit,
            truncated: postings.length > postingLimit || (input.postingPage ?? 0) > 0,
            postingPage: input.postingPage ?? 0,
            nextPostingPage: postings.length > postingLimit ? (input.postingPage ?? 0) + 1 : null,
            candidatePage: input.candidatePage ?? 0,
            countsScope: "current_posting_page",
            scope: "matching_page_identifiers_order_references_first"
          },
          productSnapshot: {
            available: inventory !== null,
            observedAt: inventory?.observedAt ?? null,
            status: stock?.status ?? null
          }
        },
        notes: [
          "Current product matches use observed FBA identities; historicalProduct uses explicit dated mappings. Neither establishes batch identity.",
          "Financial candidates are not reconciled costs; do not add report amounts to posting totals.",
          "No match is not proof of missing reimbursement. Inspect source coverage and search truncation.",
          "Breakdown and item checks are independent views of the same transaction total, never additive."
        ]
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}

async function reimbursementFamily(
  tx: Pick<ReturnType<typeof db>, "select">,
  orgId: string,
  externalAccountId: string,
  marketplaceId: string,
  seed: string[],
  pageSourceRowIds: string[]
) {
  const select = {
    sourceRowId: amazonReimbursements.id,
    id: amazonReimbursements.reimbursementId,
    originalId: amazonReimbursements.originalReimbursementId,
    originalType: amazonReimbursements.originalReimbursementType,
    approvedAt: amazonReimbursements.approvedAt,
    sku: amazonReimbursements.sku,
    asin: amazonReimbursements.asin,
    fnsku: amazonReimbursements.fnsku,
    condition: amazonReimbursements.condition,
    reason: amazonReimbursements.reason,
    currency: amazonReimbursements.currency,
    amount: amazonReimbursements.amountTotal,
    quantityCash: amazonReimbursements.quantityCash,
    quantityInventory: amazonReimbursements.quantityInventory,
    quantityTotal: amazonReimbursements.quantityTotal
  }
  const query = (ids: string[]) =>
    tx
      .select(select)
      .from(amazonReimbursements)
      .where(
        and(
          eq(amazonReimbursements.orgId, orgId),
          eq(amazonReimbursements.externalAccountId, externalAccountId),
          eq(amazonReimbursements.marketplaceId, marketplaceId),
          or(
            inArray(amazonReimbursements.reimbursementId, ids),
            inArray(amazonReimbursements.originalReimbursementId, ids)
          )
        )
      )
      .orderBy(amazonReimbursements.approvedAt, amazonReimbursements.id)
      .limit(1001)
  const records = new Map<string, Awaited<ReturnType<typeof query>>[number]>()
  // Keep the current page first so the cap cannot remove its explicit accounting diagnostics.
  if (pageSourceRowIds.length) {
    const own = await tx
      .select(select)
      .from(amazonReimbursements)
      .where(
        and(
          eq(amazonReimbursements.orgId, orgId),
          eq(amazonReimbursements.externalAccountId, externalAccountId),
          eq(amazonReimbursements.marketplaceId, marketplaceId),
          inArray(amazonReimbursements.id, pageSourceRowIds)
        )
      )
    for (const row of own) {
      records.set(row.sourceRowId, row)
    }
  }
  const visited = new Set<string>()
  let pending = [...new Set(seed)]
  for (let depth = 0; depth < 8 && pending.length; depth++) {
    const rows = await query(pending)
    pending.forEach((id) => visited.add(id))
    for (const row of rows) {
      records.set(row.sourceRowId, row)
    }
    if (rows.length > 1000 || records.size > 1000) {
      return { rows: [...records.values()].slice(0, 1000), truncated: true }
    }
    pending = [...new Set(rows.flatMap((row) => [row.id, ...(row.originalId ? [row.originalId] : [])]))].filter(
      (id) => !visited.has(id)
    )
  }
  return { rows: [...records.values()], truncated: pending.length > 0 }
}
