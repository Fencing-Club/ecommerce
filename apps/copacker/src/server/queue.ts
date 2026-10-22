import { and, eq, sql, lt, lte, inArray } from "drizzle-orm"
import invariant from "tiny-invariant"
import { db, type Transaction } from "../db/index"
import { jobs } from "../db/schema"
import { jobDefinition } from "./job-registry"
import { jobConcurrency } from "./job-runner"
import { PollAgain } from "./job-runtime"
import { describeError, logEvent } from "./log"

// Where a claimed job runs: in a Cloudflare queue consumer or Workflow, or in the local Node worker.
type JobRuntime = "cloudflare" | "local"

// Queue consumers and Workflows share the same SQL job slots.
async function lockJobClaims(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(1616879723)`)
}

// Read once after draining, then let the external queue wake us when the next retry or abandoned lease is due.
export async function nextJobDelay() {
  const [row] = await db()
    .select({
      due: sql<
        string | null
      >`min(case when ${jobs.status} = 'running' then ${jobs.leaseAt} + interval '10 minutes' else ${jobs.runAt} end)`
    })
    .from(jobs)
    .where(inArray(jobs.status, ["pending", "running"]))
  return row?.due ? Math.max(1, Math.ceil((new Date(row.due).getTime() - Date.now()) / 1000)) : null
}

export type JobClaim = { id: string; attempt: number; leaseAt: string }

export async function runNextJob(runtime: JobRuntime = "local", dispatch?: (claim: JobClaim) => Promise<void>) {
  const job = await db().transaction(async (tx) => {
    await lockJobClaims(tx)
    await tx
      .update(jobs)
      .set({ status: "pending" })
      .where(and(eq(jobs.status, "running"), lt(jobs.leaseAt, new Date(Date.now() - 10 * 60 * 1000))))
    const [active] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(eq(jobs.status, "running"))
    if ((active?.count ?? 0) >= jobConcurrency) {
      return null
    }
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

  // A kind nothing runs goes to a Workflow too, which marks it failed.
  if (dispatch && jobDefinition(job.kind)?.executor !== "queue") {
    // Keep the lease if dispatch fails: a timed-out create may have succeeded. Recovery fences a later attempt.
    await dispatch({ id: job.id, attempt: job.attempts, leaseAt: job.leaseAt!.toISOString() })
  } else {
    await executeJob(job, runtime)
  }
  return true
}

export async function runClaimedJob(claim: JobClaim) {
  const [job] = await db()
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.id, claim.id),
        eq(jobs.attempts, claim.attempt),
        eq(jobs.leaseAt, new Date(claim.leaseAt)),
        eq(jobs.status, "running")
      )
    )
  if (job) {
    await executeJob(job, "cloudflare")
  }
}

async function executeJob(job: typeof jobs.$inferSelect, runtime: JobRuntime) {
  // One event when a job starts and one when it ends, so the logs show what the worker is doing.
  const started = Date.now()
  const attempt = { kind: job.kind, key: job.key, executor: runtime, attempt: job.attempts }
  logEvent("info", "job_started", attempt)
  const seconds = () => Math.round((Date.now() - started) / 1000)
  // Attempt numbers prevent a worker with an expired lease from changing a newer attempt.
  const owned = and(eq(jobs.id, job.id), eq(jobs.attempts, job.attempts), eq(jobs.status, "running"))
  invariant(owned)
  const assertOwned = async () => {
    const rows = await db().update(jobs).set({ leaseAt: new Date() }).where(owned).returning({ id: jobs.id })
    if (rows.length !== 1) {
      throw new Error("Job ownership changed; this worker must stop")
    }
  }
  let stopped = false
  let pendingHeartbeat: Promise<void> | undefined
  const heartbeat = async () => {
    try {
      await assertOwned()
    } catch {
      stopped = true
    }
    if (!stopped) {
      timer = setTimeout(() => {
        pendingHeartbeat = heartbeat()
      }, 30000)
    }
  }
  let timer = setTimeout(() => {
    pendingHeartbeat = heartbeat()
  }, 30000)
  const definition = jobDefinition(job.kind)
  try {
    if (!definition) {
      throw new Error("Unknown job type")
    }
    await definition.run(definition.payload.parse(job.payload), {
      key: job.key,
      attempt: job.attempts,
      assertOwned,
      owned
    })
    await db().update(jobs).set({ status: "complete", error: null }).where(owned)
    logEvent("info", "job_finished", { ...attempt, seconds: seconds() })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed"
    const poll = error instanceof PollAgain ? error.options : null
    const polling = error instanceof PollAgain && (poll?.progressed || job.attempts < 60)
    // The error is also stored on the job; logging it shows failures in the service logs without a database read.
    if (polling) {
      logEvent("info", "job_paused", { ...attempt, seconds: seconds(), reason: message })
    } else {
      logEvent("error", "job_failed", { ...attempt, error: describeError(error) })
    }
    await db().transaction(async (tx) => {
      const updated = await tx
        .update(jobs)
        .set({
          status: polling ? "pending" : "failed",
          error: message,
          runAt: new Date(Date.now() + (poll?.delayMs ?? 30000)),
          ...(poll?.payload && { payload: poll.payload }),
          ...(poll?.progressed && { attempts: 0 })
        })
        .where(owned)
        .returning({ id: jobs.id })
      const input = definition?.payload.safeParse(job.payload)
      if (updated.length && !polling && definition?.onFailure && input?.success) {
        await definition.onFailure(tx, input.data, message)
      }
    })
  } finally {
    stopped = true
    clearTimeout(timer)
    await pendingHeartbeat
  }
}
