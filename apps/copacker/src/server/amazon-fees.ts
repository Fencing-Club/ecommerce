import type { Amazon } from "@repo/copacker-marketplaces/amazon"
import { collectAmazonTransactions } from "@repo/copacker-marketplaces/sales"
import { and, eq, gte, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { amazonTransactions, salesSyncs } from "@/db/schema"
import { syncChunks, throttled } from "./sales-orders"

// Copies a year of posted Amazon transactions, so margins can include Amazon's fees. Like the orders, each period
// replaces what's stored for it, and later syncs read again from 30 days before the stored end, since fees and refunds
// post after the order. A failure is recorded on the sync but doesn't fail the order sync.
export async function syncAmazonFees(
  input: { orgId: string; externalAccountId: string; revision: number; amazon: Pick<Amazon, "request"> },
  assertOwned: () => Promise<void>
) {
  const { orgId, externalAccountId, revision } = input
  const scope = and(eq(salesSyncs.orgId, orgId), eq(salesSyncs.source, "amazon"), eq(salesSyncs.revision, revision))
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
      const rows = await throttled(
        () =>
          collectAmazonTransactions(
            input.amazon,
            { from: chunk.from.toISOString(), to: chunk.to.toISOString() },
            assertOwned
          ),
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
          .delete(amazonTransactions)
          .where(
            and(
              eq(amazonTransactions.orgId, orgId),
              eq(amazonTransactions.externalAccountId, externalAccountId),
              gte(amazonTransactions.postedAt, chunk.from),
              lt(amazonTransactions.postedAt, chunk.to)
            )
          )
        for (let index = 0; index < rows.length; index += 200) {
          await tx
            .insert(amazonTransactions)
            .values(
              rows.slice(index, index + 200).map((row) => ({
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
              target: [
                amazonTransactions.orgId,
                amazonTransactions.externalAccountId,
                amazonTransactions.transactionId
              ],
              set: {
                orderId: sql`excluded."orderId"`,
                postedAt: sql`excluded."postedAt"`,
                type: sql`excluded.type`,
                currency: sql`excluded.currency`,
                totalMinor: sql`excluded."totalMinor"`,
                feesMinor: sql`excluded."feesMinor"`,
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
    console.error(JSON.stringify({ event: "amazon_fees_sync_failed", orgId, error: message }))
    await db().update(salesSyncs).set({ feesErrorCode: "fees_failed" }).where(scope)
  }
}
