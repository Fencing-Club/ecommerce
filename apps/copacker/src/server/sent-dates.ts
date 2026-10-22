import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/db"
import { events, orders } from "@/db/schema"
import type { TimelineEventKey } from "@/lib/timeline-events"

// The event submitOrder records when it sends a PO: "submittedToSupplier" for a supplier on Copacker, which is emailed
// the PO, and "sent" for one that isn't, whose documents the buyer shares. A PO is sent once, from draft.
const sentKeys: TimelineEventKey[] = ["submittedToSupplier", "sent"]

// When each of a buyer's POs was sent to its supplier, by PO. Drafts haven't been sent.
export async function sentDates(orgId: string) {
  const rows = await db()
    .select({ orderId: events.orderId, at: sql<Date>`min(${events.createdAt})`.mapWith(events.createdAt) })
    .from(events)
    .innerJoin(orders, eq(orders.id, events.orderId))
    .where(and(eq(orders.buyerOrgId, orgId), inArray(events.messageKey, sentKeys)))
    .groupBy(events.orderId)
  return new Map(rows.map((row) => [row.orderId, row.at]))
}
