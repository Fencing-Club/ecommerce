import { z } from "zod"
import { db } from "@/db"
import { events } from "@/db/schema"
import { accessibleOrder } from "./access"
import type { Session } from "./auth"
import { ownProfile } from "./profile"

export const commentInputSchema = z.object({
  orderId: z.uuid(),
  message: z.string().trim().min(1, "Write a comment").max(4000)
})

// A comment on a PO's timeline, which everyone who can see the PO reads alongside its events.
export async function addComment(s: Session, raw: unknown) {
  const input = commentInputSchema.parse(raw)
  const [{ order }, { profile }] = await Promise.all([accessibleOrder(s, input.orderId), ownProfile(s.user.id)])
  const [row] = await db()
    .insert(events)
    .values({
      orderId: order.id,
      actor: s.user.id,
      kind: "comment",
      author: s.user.name ?? s.user.email,
      authorOrg: profile?.company || s.org.name,
      message: input.message
    })
    .returning({ id: events.id })
  return row!
}
