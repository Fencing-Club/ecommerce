import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { analyticsEvidence, analyticsFeeds, connections, salesSyncs } from "@/db/schema"
export async function publishAnalyticsFeed(
  input: { orgId: string; externalAccountId: string; revision: number },
  dataset: string,
  rows: { id: string; data: Record<string, unknown> }[],
  state: typeof analyticsFeeds.$inferInsert.state,
  assertOwned: () => Promise<void>
) {
  await assertOwned()
  const { orgId, externalAccountId, revision } = input
  await db().transaction(async (tx) => {
    const [account] = await tx
      .select({ id: connections.externalId })
      .from(connections)
      .where(
        and(
          eq(connections.orgId, orgId),
          eq(connections.provider, "amazon"),
          eq(connections.externalId, externalAccountId)
        )
      )
      .for("share")
    const [sync] = await tx
      .select({ revision: salesSyncs.revision })
      .from(salesSyncs)
      .where(
        and(
          eq(salesSyncs.orgId, orgId),
          eq(salesSyncs.source, "amazon"),
          eq(salesSyncs.externalAccountId, externalAccountId),
          eq(salesSyncs.revision, revision)
        )
      )
      .for("share")
    if (!account || !sync) {
      throw new Error("Analytics account changed")
    }
    for (const row of rows) {
      await tx
        .insert(analyticsEvidence)
        .values({ orgId, source: "amazon", externalAccountId, dataset, sourceId: row.id, data: row.data })
        .onConflictDoUpdate({
          target: [
            analyticsEvidence.orgId,
            analyticsEvidence.source,
            analyticsEvidence.externalAccountId,
            analyticsEvidence.dataset,
            analyticsEvidence.sourceId
          ],
          set: { data: row.data, observedAt: new Date() }
        })
    }
    await tx
      .insert(analyticsFeeds)
      .values({ orgId, source: "amazon", externalAccountId, dataset, state })
      .onConflictDoUpdate({
        target: [analyticsFeeds.orgId, analyticsFeeds.source, analyticsFeeds.externalAccountId, analyticsFeeds.dataset],
        set: { state, checkedAt: new Date() }
      })
  })
}
