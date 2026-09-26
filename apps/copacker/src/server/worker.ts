import { setTimeout as wait } from "node:timers/promises"
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
process.exit(0)
