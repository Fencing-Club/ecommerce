import { getCookie } from "@tanstack/react-start/server"
import handler from "@tanstack/react-start/server-entry"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { db, withDatabase } from "@/db"
import { profiles } from "@/db/schema"
import { timeZoneCookie } from "@/lib/time-zone"
import { signedInUser } from "@/server/auth"
import { withAuthentication } from "@/server/auth-session"
import { consumeJobSignals, wakeForNextJob, wakeSignal } from "@/server/cloudflare-jobs"
import { withJobPublisher } from "@/server/job-delivery"
import { resolveLocalization, withLocalization } from "@/server/localization"
import { closedForMaintenance, underMaintenance } from "@/server/maintenance"
import { runClaimedJob, type JobClaim } from "@/server/queue"
import { maintenanceResponse } from "@/server/start-maintenance"
import { r2FileStorage, withFileStorage } from "@/server/storage"

// Staging and production wake the executor; a preview wakes its own isolated queue.
function jobQueue(env: Cloudflare.Env) {
  return env.EXECUTOR_JOBS ?? env.JOBS
}

async function publishJobs(env: Cloudflare.Env, delaySeconds: number) {
  const queue = jobQueue(env)
  if (queue) {
    await wakeSignal(queue, delaySeconds)
  }
}

function withWorkerServices<T>(env: Cloudflare.Env, run: () => Promise<T>) {
  return withDatabase({ connectionString: env.HYPERDRIVE.connectionString }, () =>
    withFileStorage(
      r2FileStorage(env.DOCUMENTS),
      () => withJobPublisher((delay) => publishJobs(env, delay), run),
      env.DOCUMENTS_PREFIX
    )
  )
}

// SQL holds job payloads, retries and attempt fencing. Workflow parameters contain only the claim identity.
export class JobWorkflow extends WorkflowEntrypoint<Cloudflare.Env, JobClaim> {
  async run(event: WorkflowEvent<JobClaim>, step: WorkflowStep) {
    try {
      await step.do("execute claimed job", { retries: { limit: 0, delay: "1 second" }, timeout: "24 hours" }, () =>
        withWorkerServices(this.env, () => runClaimedJob(event.payload))
      )
    } finally {
      await step.do("wake next job", () =>
        withWorkerServices(this.env, async () => {
          const queue = jobQueue(this.env)
          if (queue) {
            await wakeForNextJob(queue, 1)
          }
        })
      )
    }
  }
}

export default {
  async queue(batch, env) {
    const queue = env.EXECUTOR_JOBS
    if (!queue) {
      throw new Error("Cloudflare job execution is not enabled")
    }
    await withWorkerServices(env, () => consumeJobSignals(batch.messages, { queue, workflow: env.JOB_WORKFLOW }))
  },
  async fetch(request, env) {
    const active = await underMaintenance()
    const render = () =>
      withJobPublisher(
        async (delaySeconds) => {
          if (env.DEPLOYMENT_ENV !== "local") {
            await publishJobs(env, delaySeconds)
          }
        },
        () => handler.fetch(request)
      )
    const response = await withLocalization(
      async () => {
        const user = active ? null : await signedInUser()
        const [profile] = user
          ? await db().select({ locale: profiles.locale }).from(profiles).where(eq(profiles.userId, user.id))
          : []
        return resolveLocalization({
          preferredLocale: profile?.locale,
          acceptLanguage: request.headers.get("accept-language"),
          timeZone: getCookie(timeZoneCookie)
        })
      },
      () =>
        active && closedForMaintenance(request)
          ? maintenanceResponse(request, render)
          : withDatabase({ connectionString: env.HYPERDRIVE.connectionString }, () =>
              withFileStorage(
                r2FileStorage(env.DOCUMENTS),
                () => withAuthentication(request, render),
                env.DOCUMENTS_PREFIX
              )
            )
    )
    const headers = new Headers(response.headers)
    // Private unless the response chose its own policy, such as an immutable product photo.
    if (!headers.has("Cache-Control")) {
      headers.set("Cache-Control", "private, no-store")
    }
    headers.set("X-Content-Type-Options", "nosniff")
    // OAuth callbacks may explicitly suppress all referrers; do not weaken that endpoint policy.
    if (headers.get("Referrer-Policy") !== "no-referrer") {
      headers.set("Referrer-Policy", "same-origin")
    }
    if (env.DEPLOYMENT_ENV !== "production") {
      headers.set("X-Robots-Tag", "noindex, nofollow")
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
} satisfies ExportedHandler<Cloudflare.Env>
