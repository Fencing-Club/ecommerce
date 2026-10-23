import { AsyncLocalStorage } from "node:async_hooks"
import { z } from "zod"
import { stores } from "@/lib/stores"
import { jobQueueConfig } from "./integration-config"
import { describeError, logEvent } from "./log"
import { providerRequest } from "./provider-request"

const envelope = z.object({ success: z.literal(true) })
export const jobSignal = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("wake") }),
  z.object({ kind: z.literal("reconcile") }),
  z.object({ kind: z.literal("notifications"), provider: z.enum(stores) })
])
const publisher = new AsyncLocalStorage<(delaySeconds: number) => Promise<void>>()
const deferredWake = new AsyncLocalStorage<{ requested: boolean }>()

// Nested domain services may queue inside the operation receipt's transaction. Publish after its outer commit.
export async function withDeferredJobWake<T>(run: () => Promise<T>): Promise<T> {
  const existing = deferredWake.getStore()
  if (existing) {
    return run()
  }
  const state = { requested: false }
  const result = await deferredWake.run(state, run)
  if (state.requested) {
    await withJobWake(Promise.resolve())
  }
  return result
}

// Each Worker invocation owns its binding. Administrative producers use the scoped HTTP credentials below.
export function withJobPublisher<T>(publish: (delaySeconds: number) => Promise<void>, run: () => T): T {
  return publisher.run(publish, run)
}

export function jobDeliveryConfigured() {
  return Boolean(publisher.getStore() || process.env.CLOUDFLARE_JOBS_QUEUE_ID)
}

async function request(action: string, body: unknown) {
  const config = jobQueueConfig()
  if (!config) {
    throw new Error("Cloudflare job delivery is not configured")
  }
  // Cloudflare can answer 200 with `success: false`, which the envelope rejects.
  await providerRequest(
    "Cloudflare Queues",
    `https://api.cloudflare.com/client/v4/accounts/${config.account}/queues/${config.queue}/messages${action}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 15000
    },
    envelope
  )
}

export async function signalJobs(delaySeconds = 0) {
  const delay = Math.min(86400, Math.max(0, Math.ceil(delaySeconds)))
  const publish = publisher.getStore()
  if (publish) {
    await publish(delay)
    return
  }
  if (!jobDeliveryConfigured()) {
    return
  }
  const body = {
    body: JSON.stringify({ kind: "wake" }),
    content_type: "text",
    delay_seconds: delay
  }
  await request("", body)
}

// Publish only after the transaction has committed. Jobs remain durable if publishing fails; the scheduled recovery
// signal repairs the commit/publish gap without reporting a successfully committed user action as a failure.
export async function withJobWake<T>(work: PromiseLike<T>): Promise<T> {
  const result = await work
  const deferred = deferredWake.getStore()
  if (deferred) {
    deferred.requested = true
    return result
  }
  try {
    await signalJobs()
  } catch (error) {
    logEvent("error", "job_signal_failed", { recovery: "hourly", error: describeError(error) })
  }
  return result
}
