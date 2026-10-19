import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import {
  analyticsEvidence,
  analyticsFeeds,
  operatingCosts,
  connections,
  organizations,
  shopifyBalanceTransactions,
  amazonInventoryMovements
} from "@/db/schema"
import { analyticsPagination } from "./analytics-contract"
import { importedProductCatalog } from "./analytics-product-evidence"
import { analyticsSnapshot } from "./analytics-snapshot"
import { reconcileReceiptMovements } from "./receipt-movement-reconciliation"
import { receiptQuantities } from "./receipt-quantities"
import { shopifyBalanceComparison } from "./shopify-balance-comparison"
import { reconcileShopifyPayments } from "./shopify-payment-reconciliation"
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
      const catalogs =
        input.source === "amazon" && ["fba_inbound_receipts", "awd_inbound_receipts"].includes(input.dataset)
          ? await importedProductCatalog(tx, orgId)
          : []
      const orderIds =
        input.source === "shopify" && input.dataset === "order_economics"
          ? rows.slice(0, 100).map((row) => row.sourceId)
          : []
      const shipmentIds =
        input.source === "amazon" && input.dataset === "fba_inbound_receipts"
          ? rows.slice(0, 100).map((row) => row.sourceId)
          : []
      const movements = shipmentIds.length
        ? await tx
            .select()
            .from(amazonInventoryMovements)
            .where(
              and(
                eq(amazonInventoryMovements.orgId, orgId),
                eq(amazonInventoryMovements.externalAccountId, input.externalAccountId),
                eq(amazonInventoryMovements.marketplaceId, "ATVPDKIKX0DER"),
                inArray(amazonInventoryMovements.referenceId, shipmentIds),
                eq(amazonInventoryMovements.eventType, "Receipts")
              )
            )
            .orderBy(amazonInventoryMovements.eventDay, amazonInventoryMovements.id)
            .limit(5001)
        : []
      const balances = orderIds.length
        ? await tx
            .select()
            .from(shopifyBalanceTransactions)
            .where(
              and(
                eq(shopifyBalanceTransactions.orgId, orgId),
                eq(shopifyBalanceTransactions.externalAccountId, input.externalAccountId),
                inArray(shopifyBalanceTransactions.orderId, orderIds)
              )
            )
            .orderBy(shopifyBalanceTransactions.transactionId)
            .limit(5001)
        : []
      return {
        rows: rows.slice(0, 100).map((row) => ({
          ...row,
          receiptQuantities: receiptQuantities(input.dataset, row.data, catalogs),
          receiptReconciliation:
            input.source === "amazon"
              ? reconcileReceiptMovements(
                  input.dataset,
                  row.sourceId,
                  receiptQuantities(input.dataset, row.data, catalogs),
                  movements.slice(0, 5000),
                  movements.length > 5000
                )
              : null,
          paymentReconciliation:
            input.source === "shopify" && input.dataset === "order_economics"
              ? {
                  ...reconcileShopifyPayments(row.data),
                  balanceComparison: shopifyBalanceComparison(
                    balances.slice(0, 5000).filter((balance) => balance.orderId === row.sourceId),
                    balances.length > 5000
                  )
                }
              : null
        })),
        snapshot,
        nextPage: rows.length > 100 ? input.page + 1 : null,
        basis: "source_evidence_not_additional_postings"
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}
export async function ingestionStatus(orgId: string) {
  const [feeds, accounts, basis] = await Promise.all([
    db().select().from(analyticsFeeds).where(eq(analyticsFeeds.orgId, orgId)),
    db()
      .select({ provider: connections.provider, externalAccountId: connections.externalId })
      .from(connections)
      .where(eq(connections.orgId, orgId)),
    db().execute(sql`
      select kind as input, coalesce(data->>'costBasis', 'unknown') as basis, count(*)::int as count
        from inventory_basis_records where "orgId"=${orgId} and "retiredAt" is null group by 1, 2
      union all select 'landed_charges', coalesce(data->>'costBasis', 'unknown'), count(*)::int
        from inventory_landed_charges where "orgId"=${orgId} and "retiredAt" is null group by 2
      union all select 'product_mappings', 'dated', count(*)::int
        from amazon_product_mappings where "orgId"=${orgId} and "retiredAt" is null
      union all select 'unit_mappings', 'dated', count(*)::int
        from inventory_unit_mappings where "orgId"=${orgId} and "retiredAt" is null
    `)
  ])
  return {
    feeds,
    accounts,
    accountingInputs: {
      counts: z
        .array(z.object({ input: z.string(), basis: z.string(), count: z.number().int().nonnegative() }))
        .parse(basis.rows),
      missingInputMeaning: "not_recorded",
      coverage: "not_assessed",
      requiredEvidence: [
        "dated_purchase_costs",
        "opening_counts_and_values",
        "landed_bills",
        "dated_product_and_unit_mappings",
        "receipt_dates_and_purchase_allocations"
      ],
      countsDoNotEstablishCostCoverage: true
    },
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
