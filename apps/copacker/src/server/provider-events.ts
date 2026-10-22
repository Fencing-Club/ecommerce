import { and, eq } from "drizzle-orm"
import type { z } from "zod"
import { db } from "@/db"
import { connections, jobs, organizations } from "@/db/schema"
import { withJobWake } from "./job-delivery"
import { jobRow, type JobPayload } from "./job-payloads"
import { PollAgain } from "./job-runtime"
import { logEvent } from "./log"
import type { Provider } from "./provider-accounts"
import { SalesSyncError } from "./sales-orders"

// The steps Shopify's, eBay's and Amazon's events share. Each provider's events arrive in an SQS queue the worker reads
// (see pollQueue). A message only says that something changed: it queues an event job for every workspace connected to
// the account, and the job starts the sync that reads the change.

// Events are gathered into five-minute periods, so a burst of them reads the provider once. A period's jobs run three
// minutes after it ends, when the orders in it have settled (see syncChunks).
const batchMs = 5 * 60000
export const settleMs = 3 * 60000

const eventProviders = {
  "shopify-event": "shopify",
  "ebay-event": "ebay",
  "amazon-event": "amazon"
} as const satisfies Record<string, Provider>
type EventKind = keyof typeof eventProviders

// A queue message read with its schema, or null for one that isn't the provider's event, which is logged and dropped.
export function readMessage<T>(body: string, schema: z.ZodType<T>, ignored: string): T | null {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    json = null
  }
  const message = schema.safeParse(json)
  if (!message.success) {
    logEvent("warn", ignored, { reason: "unrecognized event" })
    return null
  }
  return message.data
}

// Queues an event's job for every workspace connected to the provider account, once per period and target, or to run
// right away when `immediate`. Returns how many workspaces it reached.
export async function queueEventJobs<K extends EventKind>(
  kind: K,
  externalId: string,
  event: { payload: (orgId: string) => JobPayload<K>; target?: string; at: number; immediate?: boolean }
) {
  const accounts = await db()
    .select({ orgId: connections.orgId })
    .from(connections)
    .where(and(eq(connections.provider, eventProviders[kind]), eq(connections.externalId, externalId)))
  if (!accounts.length) {
    return 0
  }
  const batch = Math.floor(event.at / batchMs)
  const runAt = new Date(event.immediate ? event.at : (batch + 1) * batchMs + settleMs)
  const period = event.target === undefined ? batch : `${event.target}:${batch}`
  await withJobWake(
    db()
      .insert(jobs)
      .values(accounts.map(({ orgId }) => jobRow(kind, `${kind}:${orgId}:${period}`, event.payload(orgId), { runAt })))
      .onConflictDoNothing()
  )
  return accounts.length
}

// The workspace an event job runs for, or null when it disconnected or switched accounts after the event arrived.
export async function eventWorkspace(orgId: string, provider: Provider, externalId: string) {
  const [account] = await db()
    .select({ kind: organizations.kind })
    .from(connections)
    .innerJoin(organizations, eq(organizations.id, connections.orgId))
    .where(
      and(eq(connections.orgId, orgId), eq(connections.provider, provider), eq(connections.externalId, externalId))
    )
  return account ? { id: orgId, kind: account.kind } : null
}

// Starts the sync an event calls for. A sync already running started before the event, so it may miss it: the job runs
// again to start another once that one finishes. A connection that can't sync orders (missing access) is left alone;
// Settings already asks the buyer to reconnect.
export async function startEventSync(start: () => Promise<{ status: string } | null>, waiting: string) {
  let started
  try {
    started = await start()
  } catch (error) {
    if (error instanceof SalesSyncError) {
      return
    }
    throw error
  }
  if (started?.status === "running") {
    throw new PollAgain(waiting)
  }
}

// Queues subscribing the workspace's account to Copacker's events. Runs after connecting and daily, which also turns
// back on subscriptions the provider turned off after failed deliveries.
export async function queueSubscription(
  kind: "shopify-subscribe" | "ebay-subscribe" | "amazon-subscribe",
  orgId: string,
  key: string
) {
  await withJobWake(
    db()
      .insert(jobs)
      .values(jobRow(kind, `${kind}:${orgId}:${key}`, { orgId }))
      .onConflictDoNothing()
  )
}

// Subscribes to each topic in turn, checking first that the job still holds its attempt. A refusal names its topic.
export async function subscribeTopics<T extends string>(
  service: string,
  topics: readonly T[],
  assertOwned: () => Promise<void>,
  subscribe: (topic: T) => Promise<unknown>
) {
  for (const topic of topics) {
    await assertOwned()
    try {
      await subscribe(topic)
    } catch (error) {
      throw new Error(
        `${service} ${topic} subscription failed: ${error instanceof Error ? error.message : "unknown error"}`,
        { cause: error }
      )
    }
  }
}
