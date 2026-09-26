import { setTimeout as wait } from "node:timers/promises"
import { SQSClient } from "@aws-sdk/client-sqs"
import { pollAmazonNotifications, sqsQueue } from "./amazon-notifications"
import { runNextJob } from "./queue"
import { queueReconciliation } from "./reconcile"
let stopped = false
// When this worker last made sure today's reconciliation is queued; every worker checks, the job key keeps it to one.
let scheduledAt = 0
process.on("SIGTERM", () => {
  stopped = true
})
process.on("SIGINT", () => {
  stopped = true
})

// Amazon's notifications arrive in an SQS queue. Reading it waits up to 20 seconds for messages, so it runs beside
// the job loop rather than in it. The AWS region and credentials come from the standard AWS_* variables.
async function readAmazonNotifications(queueUrl: string) {
  const queue = sqsQueue(new SQSClient({}), queueUrl)
  while (!stopped) {
    try {
      await pollAmazonNotifications(queue)
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "amazon_notifications_read_failed",
          error: error instanceof Error ? error.message : "unknown error"
        })
      )
      await wait(10000)
    }
  }
}
const queueUrl = process.env.AMAZON_NOTIFICATIONS_QUEUE_URL
const notifications = queueUrl ? readAmazonNotifications(queueUrl) : Promise.resolve()

while (!stopped) {
  try {
    if (Date.now() - scheduledAt > 10 * 60000) {
      await queueReconciliation()
      scheduledAt = Date.now()
    }
    const worked = await runNextJob()
    if (!worked) {
      await wait(2000)
    }
  } catch {
    console.error("Worker database unavailable; retrying shortly")
    await wait(10000)
  }
}
// A message being handled when the worker stops is received again later, since it is only removed once handled.
await Promise.race([notifications, wait(25000)])
process.exit(0)
