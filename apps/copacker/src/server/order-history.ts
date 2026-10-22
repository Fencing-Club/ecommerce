import type { OrderInput } from "@repo/copacker-orders"
import { eq } from "drizzle-orm"
import type { Executor, Transaction } from "@/db"
import { events, jobs, orderRevisions, orders } from "@/db/schema"
import { eventMessage, type revisionReasons, type TimelineEvent } from "@/lib/timeline-events"
import { jobRow } from "./job-payloads"

// What a PO keeps of its own history: the timeline everyone on it reads, its revisions, and the copies its supplier is
// emailed.

// Adds what someone did to a PO's timeline, in the caller's transaction.
export async function recordEvent(executor: Executor, orderId: string, actor: string, event: TimelineEvent) {
  await executor.insert(events).values({ orderId, actor, ...eventMessage(event) })
}

// Saves a PO's data as its next revision, with who changed it and why, along with any other changes to the PO itself.
// Returns the new revision.
export async function reviseOrder(
  tx: Transaction,
  order: { id: string; revision: number },
  data: OrderInput,
  {
    actor,
    reason,
    set
  }: { actor: string; reason: (typeof revisionReasons)[number]; set?: Partial<typeof orders.$inferInsert> }
) {
  const revision = order.revision + 1
  await tx
    .update(orders)
    .set({ ...set, data, revision, updatedAt: new Date() })
    .where(eq(orders.id, order.id))
  await tx.insert(orderRevisions).values({ orderId: order.id, revision, data, actor, reason })
  return revision
}

// Emails a PO's revision to its supplier, once per revision. Only a supplier that joined Copacker gets it; for one that
// hasn't, the buyer downloads the PO and shares it.
export async function queuePoEmail(
  tx: Transaction,
  order: { id: string; revision: number },
  supplier: { supplierOrgId: string | null; email: string | null }
) {
  if (!supplier.supplierOrgId || !supplier.email) {
    return
  }
  await tx
    .insert(jobs)
    .values(
      jobRow("email", `po:${order.id}:${order.revision}`, {
        type: "po",
        orderId: order.id,
        revision: order.revision,
        to: supplier.email
      })
    )
    .onConflictDoNothing()
}
