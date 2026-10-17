import { inArray, not, sql } from "drizzle-orm"
import type { Transaction } from "@/db"
import { jobs } from "@/db/schema"

// These handlers enqueue work or process a checkpointed page. Long imports and external shipment creates stay on Node.
export const cloudflareJobKinds = ["analytics", "shopify-event", "ebay-event"] as const
export type JobExecutor = "railway" | "cloudflare" | "local"

export function jobExecutorCondition(runtime: JobExecutor) {
  if (runtime === "local") {
    return undefined
  }
  const assigned = inArray(jobs.kind, cloudflareJobKinds)
  return runtime === "cloudflare" ? assigned : not(assigned)
}

// All deployed executors share the same three SQL job slots, including simultaneous queue deliveries.
export async function lockJobClaims(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(1616879723)`)
}
