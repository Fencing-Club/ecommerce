import { and, eq, sql, lt, lte, inArray } from "drizzle-orm"
import { db } from "../db/index"
import { jobs, shipments } from "../db/schema"
import { importJob } from "./import-job"
import { amazonJob, emailJob, shopifyJob, PollAgain } from "./job-handlers"
import { salesJob } from "./sales-orders"
import { stockJob } from "./stock"

export async function runNextJob() {
  const job = await db().transaction(async (tx) => {
    await tx
      .update(jobs)
      .set({ status: "pending" })
      .where(and(eq(jobs.status, "running"), lt(jobs.leaseAt, new Date(Date.now() - 10 * 60 * 1000))))
    const [next] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "pending"), lte(jobs.runAt, new Date())))
      .orderBy(jobs.createdAt)
      .limit(1)
      .for("update", { skipLocked: true })
    if (!next) {
      return null
    }
    const [claimed] = await tx
      .update(jobs)
      .set({ status: "running", leaseAt: new Date(), attempts: sql`${jobs.attempts} + 1` })
      .where(eq(jobs.id, next.id))
      .returning()
    return claimed!
  })
  if (!job) {
    return false
  }

  // Attempt numbers prevent a worker with an expired lease from changing a newer attempt.
  const owned = and(eq(jobs.id, job.id), eq(jobs.attempts, job.attempts), eq(jobs.status, "running"))
  const assertOwned = async () => {
    const rows = await db().update(jobs).set({ leaseAt: new Date() }).where(owned).returning({ id: jobs.id })
    if (rows.length !== 1) {
      throw new Error("Job ownership changed; this worker must stop")
    }
  }
  let stopped = false
  const heartbeat = async () => {
    try {
      await assertOwned()
    } catch {
      stopped = true
    }
    if (!stopped) {
      timer = setTimeout(() => {
        void heartbeat()
      }, 30000)
    }
  }
  let timer = setTimeout(() => {
    void heartbeat()
  }, 30000)
  try {
    if (job.kind === "stock") {
      await stockJob(job.payload, assertOwned, job)
    } else if (job.kind === "sales") {
      await salesJob(job.payload, assertOwned)
    } else if (job.kind === "import") {
      await importJob(job.payload, assertOwned)
    } else if (job.kind === "amazon") {
      await amazonJob(job.payload, assertOwned)
    } else if (job.kind === "email") {
      await emailJob(job.payload, job.key, assertOwned)
    } else if (job.kind === "shopify") {
      await shopifyJob(job.payload, assertOwned)
    } else {
      throw new Error("Unknown job type")
    }
    await db().update(jobs).set({ status: "complete", error: null }).where(owned)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed"
    const polling = error instanceof PollAgain && job.attempts < 60
    await db().transaction(async (tx) => {
      const updated = await tx
        .update(jobs)
        .set({ status: polling ? "pending" : "failed", error: message, runAt: new Date(Date.now() + 30000) })
        .where(owned)
        .returning({ id: jobs.id })
      if (
        updated.length &&
        !polling &&
        job.kind === "amazon" &&
        typeof job.payload.shipmentId === "string" &&
        typeof job.payload.revision === "number"
      ) {
        await tx
          .update(shipments)
          .set({ status: "needs_attention", issue: message })
          .where(
            and(
              eq(shipments.id, job.payload.shipmentId),
              eq(shipments.revision, job.payload.revision),
              inArray(shipments.status, ["queued", "creating"])
            )
          )
      }
    })
  } finally {
    stopped = true
    clearTimeout(timer)
  }
  return true
}
