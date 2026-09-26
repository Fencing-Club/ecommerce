import { collectShopifyBalanceTransactions } from "@repo/aisle/sales"
import { and, eq, gte, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { salesSyncs, shopifyBalanceTransactions } from "@/db/schema"
import { shopifyFor } from "./connections"
import { syncChunks } from "./sales-orders"

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
  const scope = and(eq(salesSyncs.orgId, orgId), eq(salesSyncs.source, "shopify"), eq(salesSyncs.revision, revision))
  const granted = new Set(input.scopes.split(/[,\s]+/))
  if (!shopifyPayoutsScopes.every((name) => granted.has(name))) {
    await db().update(salesSyncs).set({ feesErrorCode: "reconnect" }).where(scope)
    return
  }
  const [sync] = await db().select().from(salesSyncs).where(scope)
  if (!sync) {
    return
  }
  const { chunks, fresh } = syncChunks(Date.now(), { coveredFrom: sync.feesCoveredFrom, coveredTo: sync.feesCoveredTo })
  let covered =
    fresh || !sync.feesCoveredFrom || !sync.feesCoveredTo
      ? null
      : { from: sync.feesCoveredFrom, to: sync.feesCoveredTo }
  try {
    for (const chunk of chunks) {
      // A fresh client each period, so a long copy outlives an hour-long access token.
      const rows = await collectShopifyBalanceTransactions(
        await shopifyFor(orgId, externalAccountId),
        { from: chunk.from.toISOString(), to: chunk.to.toISOString() },
        assertOwned
      )
      await assertOwned()
      covered = covered
        ? {
            from: chunk.from < covered.from ? chunk.from : covered.from,
            to: chunk.to > covered.to ? chunk.to : covered.to
          }
        : chunk
      const range = covered
      await db().transaction(async (tx) => {
        const [current] = await tx.select({ revision: salesSyncs.revision }).from(salesSyncs).where(scope).for("update")
        if (!current) {
          throw new Error("A newer sync replaced this one")
        }
        await tx
          .delete(shopifyBalanceTransactions)
          .where(
            and(
              eq(shopifyBalanceTransactions.orgId, orgId),
              eq(shopifyBalanceTransactions.externalAccountId, externalAccountId),
              gte(shopifyBalanceTransactions.processedAt, chunk.from),
              lt(shopifyBalanceTransactions.processedAt, chunk.to)
            )
          )
        for (let index = 0; index < rows.length; index += 200) {
          await tx
            .insert(shopifyBalanceTransactions)
            .values(
              rows.slice(index, index + 200).map((row) => ({
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
              set: {
                type: sql`excluded.type`,
                processedAt: sql`excluded."processedAt"`,
                orderId: sql`excluded."orderId"`,
                currency: sql`excluded.currency`,
                amountMinor: sql`excluded."amountMinor"`,
                feeMinor: sql`excluded."feeMinor"`,
                netMinor: sql`excluded."netMinor"`,
                data: sql`excluded.data`
              }
            })
        }
        await tx
          .update(salesSyncs)
          .set({ feesCoveredFrom: range.from, feesCoveredTo: range.to, feesErrorCode: null })
          .where(scope)
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error(JSON.stringify({ event: "shopify_balance_sync_failed", orgId, error: message }))
    await db().update(salesSyncs).set({ feesErrorCode: "fees_failed" }).where(scope)
  }
}
