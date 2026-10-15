import { z } from "zod"

const configuration = z.object({
  account: z.string().regex(/^[a-f0-9]{32}$/),
  queue: z.string().regex(/^[a-f0-9]{32}$/),
  token: z.string().min(1)
})
const envelope = z.object({ success: z.literal(true), result: z.unknown().optional() })
const messages = z.object({ messages: z.array(z.object({ lease_id: z.string(), body: z.unknown() })) })
export const jobSignal = z.object({ kind: z.enum(["wake", "reconcile"]) })

export function jobDeliveryConfigured() {
  return Boolean(process.env.CLOUDFLARE_JOBS_QUEUE_ID)
}

async function request(action: string, body: unknown) {
  const config = configuration.parse({
    account: process.env.CLOUDFLARE_ACCOUNT_ID,
    queue: process.env.CLOUDFLARE_JOBS_QUEUE_ID,
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
    throw new Error(`Job delivery failed (${response.status})`)
  }
  return envelope.parse(await response.json()).result
}

export async function signalJobs(delaySeconds = 0) {
  if (!jobDeliveryConfigured()) {
    return
  }
  await request("", {
    body: JSON.stringify({ kind: "wake" }),
    content_type: "text",
    delay_seconds: Math.min(86400, Math.max(0, Math.ceil(delaySeconds)))
  })
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

export async function receiveJobSignals() {
  return messages.parse(await request("/pull", { batch_size: 1, visibility_timeout_ms: 600000 })).messages
}

export async function acknowledgeJobSignal(lease: string) {
  await request("/ack", { acks: [{ lease_id: lease }], retries: [] })
}
