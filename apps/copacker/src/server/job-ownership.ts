import { sql } from "drizzle-orm"
import type { Transaction } from "@/db"

// Short handlers execute in the queue consumer; all other families use a durable Workflow attempt.
const queueJobKinds = new Set(["analytics", "shopify-event", "ebay-event", "labels"])
export type JobExecutor = "cloudflare" | "local"
export const jobNeedsWorkflow = (kind: string) => !queueJobKinds.has(kind)

// Queue consumers and Workflows share the same SQL job slots.
export async function lockJobClaims(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(1616879723)`)
}
