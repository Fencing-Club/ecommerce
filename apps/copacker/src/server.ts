import { getCookie } from "@tanstack/react-start/server"
import handler from "@tanstack/react-start/server-entry"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { db, withDatabase } from "@/db"
import { profiles } from "@/db/schema"
import { timeZoneCookie } from "@/lib/time-zone"
import { signedInUser } from "@/server/auth"
import { withAuthentication } from "@/server/auth-session"
import { consumeJobSignal } from "@/server/cloudflare-jobs"
import { jobSignal, withJobPublisher } from "@/server/job-delivery"
import { resolveLocalization, withLocalization } from "@/server/localization"
import { closedForMaintenance, underMaintenance } from "@/server/maintenance"
import { readNotifications } from "@/server/notification-reader"
import { nextJobDelay, runNextJob, runClaimedJob, type JobClaim } from "@/server/queue"
import { queueReconciliation } from "@/server/reconcile"
import { maintenanceResponse } from "@/server/start-maintenance"
import { withFileStorage } from "@/server/storage"

async function publishJobs(env: Cloudflare.Env, delaySeconds: number) {
  const queue = env.EXECUTOR_JOBS ?? env.JOBS
  if (queue) {
    await queue.send(JSON.stringify({ kind: "wake" }), { contentType: "text", delaySeconds })
  }
}

function withWorkerServices<T>(env: Cloudflare.Env, run: () => Promise<T>) {
  return withDatabase({ connectionString: env.HYPERDRIVE.connectionString }, () =>
    withFileStorage(
      {
        put: async (key, bytes, contentType) => {
          await env.DOCUMENTS.put(key, bytes, { httpMetadata: { contentType } })
        },
        get: async (key) => {
          const file = await env.DOCUMENTS.get(key)
          return file ? { body: file.body, size: file.size, contentType: file.httpMetadata?.contentType } : null
        },
        delete: (key) => env.DOCUMENTS.delete(key)
      },
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
          const delay = await nextJobDelay()
          if (delay !== null) {
            await publishJobs(this.env, Math.min(86400, Math.max(1, delay)))
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
    await withWorkerServices(env, async () => {
      for (const message of batch.messages) {
        const signal = jobSignal.parse(typeof message.body === "string" ? JSON.parse(message.body) : message.body)
        if (signal.kind === "notifications") {
          const count = await readNotifications(signal.provider)
          if (count === 10) {
            await queue.send(JSON.stringify(signal), { contentType: "text", delaySeconds: 1 })
          }
        } else {
          if (signal.kind === "reconcile") {
            await queueReconciliation()
          }
          await consumeJobSignal(
            { kind: "wake" },
            {
              runNext: () =>
                runNextJob("cloudflare", async (claim) => {
                  const workflow = env.JOB_WORKFLOW
                  if (!workflow) {
                    throw new Error("Job Workflow binding is missing")
                  }
                  const id = `${claim.id}-${Date.parse(claim.leaseAt)}`
                  try {
                    await workflow.create({ id, params: claim })
                  } catch (error) {
                    // A create response may have been lost. Only suppress it when the same instance exists.
                    try {
                      await (await workflow.get(id)).status()
                    } catch {
                      throw error
                    }
                  }
                }),
              nextDelay: () => nextJobDelay(),
              signal: async (delaySeconds) => {
                await queue.send(JSON.stringify({ kind: "wake" }), { contentType: "text", delaySeconds })
              }
            }
          )
        }
        message.ack()
      }
    })
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
                {
                  put: async (key, bytes, contentType) => {
                    await env.DOCUMENTS.put(key, bytes, { httpMetadata: { contentType } })
                  },
                  get: async (key) => {
                    const file = await env.DOCUMENTS.get(key)
                    return file
                      ? { body: file.body, size: file.size, contentType: file.httpMetadata?.contentType }
                      : null
                  },
                  delete: (key) => env.DOCUMENTS.delete(key)
                },
                () => withAuthentication(request, render),
                env.DOCUMENTS_PREFIX
              )
            )
    )
    const headers = new Headers(response.headers)
    headers.set("Cache-Control", "private, no-store")
    headers.set("X-Content-Type-Options", "nosniff")
    headers.set("Referrer-Policy", "same-origin")
    if (env.DEPLOYMENT_ENV !== "production") {
      headers.set("X-Robots-Tag", "noindex, nofollow")
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
} satisfies ExportedHandler<Cloudflare.Env>
