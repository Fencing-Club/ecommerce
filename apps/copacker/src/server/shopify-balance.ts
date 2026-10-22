import { collectShopifyBalanceTransactions } from "@repo/copacker-marketplaces/sales"
import { and, eq, gte, lt } from "drizzle-orm"
import { db } from "@/db"
import { chunked, excluded } from "@/db/helpers"
import { salesSyncs, shopifyBalanceTransactions } from "@/db/schema"
import { shopifyFor } from "./connections"
import { grantedScopes } from "./provider-accounts"
import { syncChunks } from "./sales-orders"
import { salesSyncScope, syncCoveredPeriods } from "./sales-sync-coverage"

// The Shopify permissions that show the Shopify Payments account and its payout balance transactions: labels, bills
// and dispute fees.
export const shopifyPayoutsScopes = ["read_shopify_payments_accounts", "read_shopify_payments_payouts"]

// Copies a year of Shopify Payments balance transactions, so gross profit can include shipping labels, the Shopify
// bill and dispute fees. Like the orders, each period replaces what's stored for it, and later syncs read again from
// 30 days before the stored end. Without the payouts permission, or on a failure, it's recorded on the sync without
// failing the order sync.
export async function syncShopifyBalance(
  input: { orgId: string; externalAccountId: string; revision: number; scopes: string },
  assertOwned: () => Promise<void>
) {
  const { orgId, externalAccountId, revision } = input
  const scope = { orgId, source: "shopify" as const, revision }
  const granted = grantedScopes(input.scopes)
  if (!shopifyPayoutsScopes.every((name) => granted.has(name))) {
    await db().update(salesSyncs).set({ feesErrorCode: "reconnect" }).where(salesSyncScope(scope))
    return
  }
  await syncCoveredPeriods(scope, assertOwned, {
    coverage: "fees",
    plan: (stored) => syncChunks(Date.now(), { coveredFrom: stored.from, coveredTo: stored.to }),
    // A fresh client each period, so a long copy outlives an hour-long access token.
    read: async (period) =>
      collectShopifyBalanceTransactions(
        await shopifyFor(orgId, externalAccountId),
        { from: period.from.toISOString(), to: period.to.toISOString() },
        assertOwned
      ),
    replace: async (tx, period, rows) => {
      await tx
        .delete(shopifyBalanceTransactions)
        .where(
          and(
            eq(shopifyBalanceTransactions.orgId, orgId),
            eq(shopifyBalanceTransactions.externalAccountId, externalAccountId),
            gte(shopifyBalanceTransactions.processedAt, period.from),
            lt(shopifyBalanceTransactions.processedAt, period.to)
          )
        )
      for (const batch of chunked(rows, 200)) {
        await tx
          .insert(shopifyBalanceTransactions)
          .values(
            batch.map((row) => ({
              orgId,
              externalAccountId,
              transactionId: row.transactionId,
              type: row.type,
              processedAt: new Date(row.processedAt),
              orderId: row.orderId,
              currency: row.currency,
              amountMinor: row.amountMinor,
              feeMinor: row.feeMinor,
              netMinor: row.netMinor,
              data: row.data
            }))
          )
          // A transaction whose processing time moved into another period; the newer copy wins.
          .onConflictDoUpdate({
            target: [
              shopifyBalanceTransactions.orgId,
              shopifyBalanceTransactions.externalAccountId,
              shopifyBalanceTransactions.transactionId
            ],
            set: excluded(
              shopifyBalanceTransactions,
              "type",
              "processedAt",
              "orderId",
              "currency",
              "amountMinor",
              "feeMinor",
              "netMinor",
              "data"
            )
          })
      }
    },
    failure: { event: "shopify_balance_sync_failed", errorCode: "fees_failed" }
  })
}
