import { db } from "@/db"
import { analyticsEvidence, analyticsFeeds } from "@/db/schema"
import { lockSyncScope } from "./sales-sync-coverage"

// Saves a page of provider evidence and its feed's state together. Only the sales sync revision that collected them
// may publish, and only while its account is still connected.
export async function publishAnalyticsFeed(
  input: { orgId: string; source: "amazon" | "shopify" | "ebay"; externalAccountId: string; revision: number },
  dataset: string,
  rows: { id: string; data: Record<string, unknown> }[],
  state: typeof analyticsFeeds.$inferInsert.state,
  assertOwned: () => Promise<void>,
  observedAt = new Date()
) {
  await assertOwned()
  const { orgId, source, externalAccountId, revision } = input
  await db().transaction(async (tx) => {
    await lockSyncScope(tx, { orgId, source, revision, externalAccountId }, "share")
    for (const row of rows) {
      await tx
        .insert(analyticsEvidence)
        .values({ orgId, source, externalAccountId, dataset, sourceId: row.id, data: row.data, observedAt })
        .onConflictDoUpdate({
          target: [
            analyticsEvidence.orgId,
            analyticsEvidence.source,
            analyticsEvidence.externalAccountId,
            analyticsEvidence.dataset,
            analyticsEvidence.sourceId
          ],
          set: { data: row.data, observedAt }
        })
    }
    await tx
      .insert(analyticsFeeds)
      .values({ orgId, source, externalAccountId, dataset, state, checkedAt: observedAt })
      .onConflictDoUpdate({
        target: [analyticsFeeds.orgId, analyticsFeeds.source, analyticsFeeds.externalAccountId, analyticsFeeds.dataset],
        set: { state, checkedAt: observedAt }
      })
  })
}
