import { setTimeout as wait } from "node:timers/promises"
import { SQSClient } from "@aws-sdk/client-sqs"
import { pollAmazonNotifications, sqsQueue } from "./amazon-notifications"
import { runNextJob } from "./queue"
import { queueReconciliation } from "./reconcile"
let stopped = false
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
void scheduleReconciliation()
await Promise.all(Array.from({ length: jobLoops }, () => runJobs()))
// A message being handled when the worker stops is received again later, since it is only removed once handled.
await Promise.race([notifications, wait(25000)])
process.exit(0)
