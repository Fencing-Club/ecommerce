import { setTimeout as wait } from "node:timers/promises"
import { SQSClient } from "@aws-sdk/client-sqs"
import { closeDatabase } from "@/db"
import { pollAmazonNotifications } from "./amazon-notifications"
import { pollEbayEvents } from "./ebay-events"
import { acknowledgeJobSignal, jobDeliveryConfigured, jobSignal, receiveJobSignals, signalJobs } from "./job-delivery"
import { drainPendingJobs, jobConcurrency, limitJobConcurrency } from "./job-runner"
import { logLine } from "./log"
import { nextJobDelay, runNextJob } from "./queue"
import { queueReconciliation } from "./reconcile"
import { pollShopifyEvents } from "./shopify-webhooks"
import type { NotificationQueue } from "./sqs"
import { sqsQueue } from "./sqs"
let stopped = false
process.on("SIGTERM", () => {
  stopped = true
})
process.on("SIGINT", () => {
  stopped = true
})

// Amazon's notifications and the EventBridge events from Shopify and eBay arrive in SQS queues. Reading one waits up
// to 20 seconds for messages, so each queue has its own loop beside the job loops. The AWS region and credentials come
// from the standard AWS_* variables.
const sqs = new SQSClient({})
async function readQueue(name: string, queueUrl: string, poll: (queue: NotificationQueue) => Promise<number>) {
  const queue = sqsQueue(sqs, queueUrl)
  while (!stopped) {
    try {
      await poll(queue)
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "queue_read_failed",
          queue: name,
          error: error instanceof Error ? error.message : "unknown error"
        })
      )
      await wait(10000)
    }
  }
}
const amazonQueueUrl = process.env.AMAZON_NOTIFICATIONS_QUEUE_URL
const shopifyQueueUrl = process.env.SHOPIFY_EVENTS_QUEUE_URL
const ebayQueueUrl = process.env.EBAY_EVENTS_QUEUE_URL
const queueReaders = Promise.all([
  amazonQueueUrl ? readQueue("amazon", amazonQueueUrl, (queue) => pollAmazonNotifications(queue)) : null,
  shopifyQueueUrl ? readQueue("shopify", shopifyQueueUrl, (queue) => pollShopifyEvents(queue)) : null,
  ebayQueueUrl ? readQueue("ebay", ebayQueueUrl, (queue) => pollEbayEvents(queue)) : null
])
const readQueues = [amazonQueueUrl && "amazon", shopifyQueueUrl && "shopify", ebayQueueUrl && "ebay"].filter(Boolean)

// Jobs run in several loops, so a long job (a year of Amazon orders) doesn't hold up the rest. Each claim skips jobs
// another loop holds, and each sync guards against a second run for the same workspace and source.
const runNext = limitJobConcurrency(() => (stopped ? Promise.resolve(false) : runNextJob()))
async function drainJobs() {
  await drainPendingJobs({ runNext, nextDelay: nextJobDelay, signal: signalJobs, stopped: () => stopped })
}
async function runJobs() {
  if (!jobDeliveryConfigured() && process.env.NODE_ENV === "production") {
    throw new Error("Production workers require Cloudflare job delivery configuration")
  }
  let recover = true
  while (!stopped) {
    try {
      // Startup recovery belongs inside the retry boundary, including a transient Neon wake-up failure.
      if (recover) {
        await drainJobs()
        recover = false
      }
      if (!jobDeliveryConfigured()) {
        // Local Docker development has no hosted queue or scheduler.
        await queueReconciliation()
        await drainJobs()
        await wait(2000)
        continue
      }
      const received = await receiveJobSignals()
      for (const message of received) {
        const body: unknown = typeof message.body === "string" ? JSON.parse(message.body) : message.body
        const signal = jobSignal.parse(body)
        if (signal.kind === "reconcile") {
          await queueReconciliation()
        }
        await drainJobs()
        await acknowledgeJobSignal(message.lease_id)
      }
      if (!received.length) {
        // Cloudflare HTTP pull is short polling. Empty requests never touch Postgres.
        await wait(5000)
      }
    } catch {
      console.error("Job delivery or processing unavailable; retrying shortly")
      await wait(10000)
    }
  }
}
logLine(
  `Worker started with ${jobConcurrency} job slots${readQueues.length ? `, reading the ${readQueues.join(", ")} queues` : ""}`
)
// Independent readers can wake free slots while another reader waits for a long import to finish.
await Promise.all(Array.from({ length: jobConcurrency }, () => runJobs()))
// A message being handled when the worker stops is received again later, since it is only removed once handled.
await Promise.race([queueReaders, wait(25000)])
sqs.destroy()
await closeDatabase()
