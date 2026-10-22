import { and, desc, eq, isNull, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { events } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { type AccessibleOrder, accessibleOrder } from "./access"
import { ownProfile } from "./profile"
import type { Session } from "./workspace-session"

export const commentInputSchema = z.object({
  orderId: z.uuid(),
  message: z.string().trim().min(1, "notifications.comments.write").max(4000),
  visibility: z.enum(["internal", "shared"])
})

// A PO's events and the comments the workspace can read, newest first. `po` is the PO's id, or the PO the caller has
// already opened with accessibleOrder.
export async function orderEvents(s: Session, po: string | AccessibleOrder) {
  const { order } = typeof po === "string" ? await accessibleOrder(s, po) : po
  return db()
    .select()
    .from(events)
    .where(and(eq(events.orderId, order.id), or(isNull(events.internalOrgId), eq(events.internalOrgId, s.org.id))))
    .orderBy(desc(events.createdAt))
}

// The workspace comes from the authenticated session; clients cannot choose another workspace's private audience. A
// closed PO shows no comments, so it takes none; the PO is locked so it can't close while one is added.
export async function addComment(s: Session, raw: unknown) {
  const input = commentInputSchema.parse(raw)
  const { profile } = await ownProfile(s.user.id)
  return db().transaction(async (tx) => {
    const { order } = await accessibleOrder(s, input.orderId, tx, true)
    if (order.status === "closed") {
      throw new LocalizedError("orderAlreadyClosed")
    }
    const [row] = await tx
      .insert(events)
      .values({
        orderId: order.id,
        actor: s.user.id,
        kind: "comment",
        author: s.user.name ?? s.user.email,
        authorOrg: profile?.company || s.org.name,
        message: input.message,
        internalOrgId: input.visibility === "internal" ? s.org.id : null
      })
      .returning({ id: events.id })
    return row!
  })
}
