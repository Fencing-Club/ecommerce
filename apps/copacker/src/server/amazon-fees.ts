import type { Amazon } from "@repo/copacker-marketplaces/amazon"
import { collectAmazonTransactions } from "@repo/copacker-marketplaces/sales"
import { and, eq, gte, lt } from "drizzle-orm"
import { chunked, excluded } from "@/db/helpers"
import { amazonTransactions } from "@/db/schema"
import { syncChunks, throttled } from "./sales-orders"
import { syncCoveredPeriods } from "./sales-sync-coverage"

// Copies a year of posted Amazon transactions, so margins can include Amazon's fees. Like the orders, each period
// replaces what's stored for it, and later syncs read again from 30 days before the stored end, since fees and refunds
// post after the order. A failure is recorded on the sync but doesn't fail the order sync.
export async function syncAmazonFees(
  input: { orgId: string; externalAccountId: string; revision: number; amazon: Pick<Amazon, "request"> },
  assertOwned: () => Promise<void>
) {
  const { orgId, externalAccountId, revision } = input
  await syncCoveredPeriods({ orgId, source: "amazon", revision }, assertOwned, {
    coverage: "fees",
    plan: (stored) => syncChunks(Date.now(), { coveredFrom: stored.from, coveredTo: stored.to }),
    read: (period) =>
      throttled(
        () =>
          collectAmazonTransactions(
            input.amazon,
            { from: period.from.toISOString(), to: period.to.toISOString() },
            assertOwned
          ),
        assertOwned
      ),
    replace: async (tx, period, rows) => {
      await tx
        .delete(amazonTransactions)
        .where(
          and(
            eq(amazonTransactions.orgId, orgId),
            eq(amazonTransactions.externalAccountId, externalAccountId),
            gte(amazonTransactions.postedAt, period.from),
            lt(amazonTransactions.postedAt, period.to)
          )
        )
      for (const batch of chunked(rows, 200)) {
        await tx
          .insert(amazonTransactions)
          .values(
            batch.map((row) => ({
              orgId,
              externalAccountId,
              transactionId: row.transactionId,
              orderId: row.orderId,
              postedAt: new Date(row.postedAt),
              type: row.type,
              currency: row.currency,
              totalMinor: row.totalMinor,
              feesMinor: row.feesMinor,
              data: row.data
            }))
          )
          // A transaction whose posting time moved into another period; the newer copy wins.
          .onConflictDoUpdate({
            target: [amazonTransactions.orgId, amazonTransactions.externalAccountId, amazonTransactions.transactionId],
            set: excluded(
              amazonTransactions,
              "orderId",
              "postedAt",
              "type",
              "currency",
              "totalMinor",
              "feesMinor",
              "data"
            )
          })
      }
    },
    failure: { event: "amazon_fees_sync_failed", errorCode: "fees_failed" }
  })
}
