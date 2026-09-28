import { setTimeout as wait } from "node:timers/promises"
import { SQSClient } from "@aws-sdk/client-sqs"
import { pollAmazonNotifications } from "./amazon-notifications"
import { pollEbayEvents } from "./ebay-events"
import { logLine } from "./log"
import { runNextJob } from "./queue"
import { queueReconciliation } from "./reconcile"
import { pollShopifyEvents } from "./shopify-webhooks"
import { type NotificationQueue, sqsQueue } from "./sqs"
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
const jobLoops = 3
async function runJobs() {
  while (!stopped) {
    try {
      const worked = await runNextJob()
      if (!worked) {
        await wait(2000)
      }
    } catch {
      console.error("Worker database unavailable; retrying shortly")
      await wait(10000)
    }
  }
}
async function scheduleReconciliation() {
  while (!stopped) {
    try {
      await queueReconciliation()
    } catch {
      console.error("Worker database unavailable; retrying shortly")
    }
    await wait(10 * 60000, undefined, { ref: false })
  }
}
logLine(
  `Worker started with ${jobLoops} job loops${readQueues.length ? `, reading the ${readQueues.join(", ")} queues` : ""}`
)
void scheduleReconciliation()
await Promise.all(Array.from({ length: jobLoops }, () => runJobs()))
// A message being handled when the worker stops is received again later, since it is only removed once handled.
await Promise.race([queueReaders, wait(25000)])
process.exit(0)
