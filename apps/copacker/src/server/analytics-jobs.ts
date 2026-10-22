import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { connections, jobs, salesSyncs } from "@/db/schema"
import { withJobWake } from "./job-delivery"
import { jobRow, type JobInput, type JobPayload } from "./job-payloads"
import { PollAgain, type JobContext } from "./job-runtime"
import { syncShopifyEconomics } from "./shopify-economics"
export async function queueShopifyEconomics(input: JobPayload<"analytics">) {
  await withJobWake(
    db()
      .insert(jobs)
      .values(jobRow("analytics", `analytics:shopify:${input.orgId}:${input.revision}`, input))
      .onConflictDoNothing()
  )
}
// The sales sync queues this independent job. Each successful page checkpoints before yielding,
// so a restart resumes without re-reading orders or waiting for tomorrow's sales reconciliation.
export async function analyticsJob(input: JobInput<"analytics">, { assertOwned }: Pick<JobContext, "assertOwned">) {
  await assertOwned()
  const [account] = await db()
    .select({ scopes: connections.scopes })
    .from(connections)
    .where(
      and(
        eq(connections.orgId, input.orgId),
        eq(connections.provider, "shopify"),
        eq(connections.externalId, input.externalAccountId)
      )
    )
  const [sync] = await db()
    .select({ revision: salesSyncs.revision })
    .from(salesSyncs)
    .where(
      and(
        eq(salesSyncs.orgId, input.orgId),
        eq(salesSyncs.source, "shopify"),
        eq(salesSyncs.externalAccountId, input.externalAccountId),
        eq(salesSyncs.revision, input.revision)
      )
    )
  if (!account || !sync) {
    return
  }
  const result = await syncShopifyEconomics({ ...input, scopes: account.scopes }, assertOwned)
  if (result.failed) {
    throw new PollAgain("Shopify financial evidence collection failed; retrying", { delayMs: 60000 })
  }
  if (result.hasMore) {
    throw new PollAgain("Shopify financial history continues from the saved page", { progressed: true })
  }
}
