import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, jobs, salesSyncs } from "@/db/schema"
import { withJobWake } from "./job-delivery"
import { PollAgain } from "./job-handlers"
import { syncShopifyEconomics } from "./shopify-economics"
const inputSchema = z.strictObject({
  orgId: z.uuid(),
  externalAccountId: z.string().min(1),
  revision: z.number().int().positive()
})
export async function queueShopifyEconomics(input: z.infer<typeof inputSchema>) {
  await withJobWake(
    db()
      .insert(jobs)
      .values({
        key: `analytics:shopify:${input.orgId}:${input.revision}`,
        kind: "analytics",
        payload: input
      })
      .onConflictDoNothing()
  )
}
// The sales sync queues this independent job. Each successful page checkpoints before yielding,
// so a restart resumes without re-reading orders or waiting for tomorrow's sales reconciliation.
export async function analyticsJob(payload: Record<string, unknown>, assertOwned: () => Promise<void>) {
  const input = inputSchema.parse(payload)
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
