import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { jobs } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { accessibleOrder } from "./access"
import { withJobWake } from "./job-delivery"
import type { Session } from "./workspace-session"

// Runs a failed email or Shopify job of a PO the workspace can open again, now. Amazon jobs are retried through their
// shipment, which knows what Amazon made of the last try.
export async function retryJob(s: Session, id: string) {
  const [job] = await db().select().from(jobs).where(eq(jobs.id, id))
  const orderId = z.uuid().safeParse(job?.payload.orderId)
  if (!job || job.kind === "amazon" || job.status !== "failed" || !orderId.success) {
    throw new LocalizedError("jobCannotBeRetried")
  }
  await accessibleOrder(s, orderId.data)
  await withJobWake(db().update(jobs).set({ status: "pending", runAt: new Date(), error: null }).where(eq(jobs.id, id)))
}
