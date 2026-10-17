import { AsyncLocalStorage } from "node:async_hooks"
import { z } from "zod"

const configuration = z.object({
  account: z.string().regex(/^[a-f0-9]{32}$/),
  queue: z.string().regex(/^[a-f0-9]{32}$/),
  token: z.string().min(1)
})
const envelope = z.object({ success: z.literal(true), result: z.unknown().optional() })
export const jobSignal = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("wake") }),
  z.object({ kind: z.literal("reconcile") }),
  z.object({ kind: z.literal("notifications"), provider: z.enum(["amazon", "shopify", "ebay"]) })
])
const publisher = new AsyncLocalStorage<(delaySeconds: number) => Promise<void>>()

// Each Worker invocation owns its binding. Administrative producers use the scoped HTTP credentials below.
export function withJobPublisher<T>(publish: (delaySeconds: number) => Promise<void>, run: () => T): T {
  return publisher.run(publish, run)
}

export function jobDeliveryConfigured() {
  return Boolean(publisher.getStore() || process.env.CLOUDFLARE_JOBS_QUEUE_ID)
}

async function request(action: string, body: unknown, queue = process.env.CLOUDFLARE_JOBS_QUEUE_ID) {
  const config = configuration.parse({
    account: process.env.CLOUDFLARE_ACCOUNT_ID,
    queue,
    token: process.env.CLOUDFLARE_JOBS_TOKEN
  })
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.account}/queues/${config.queue}/messages${action}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    }
  )
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Job delivery failed (${response.status})`)
  }
  return envelope.parse(await response.json()).result
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
  try {
    await signalJobs()
  } catch {
    console.error(JSON.stringify({ event: "job_signal_failed", recovery: "hourly" }))
  }
  return result
}
