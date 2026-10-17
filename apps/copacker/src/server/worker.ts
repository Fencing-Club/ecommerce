import { setTimeout as wait } from "node:timers/promises"
import { closeDatabase } from "@/db"
import { drainPendingJobs, jobConcurrency, limitJobConcurrency } from "./job-runner"
import { logLine } from "./log"
import { nextJobDelay, runNextJob } from "./queue"
import { queueReconciliation } from "./reconcile"

// Hosted jobs run exclusively on Cloudflare. This runner is for the developer's local Docker database.
if (process.env.NODE_ENV === "production") {
  throw new Error("Hosted background jobs run on Cloudflare")
}
let stopped = false
process.on("SIGTERM", () => {
  stopped = true
})
process.on("SIGINT", () => {
  stopped = true
})
const runNext = limitJobConcurrency(() => (stopped ? Promise.resolve(false) : runNextJob("local")))
logLine(`Local worker started with ${jobConcurrency} job slots`)
try {
  while (!stopped) {
    try {
      await queueReconciliation()
      await drainPendingJobs({
        runNext,
        nextDelay: nextJobDelay,
        signal: async () => undefined,
        stopped: () => stopped
      })
    } catch {
      console.error("Local job processing unavailable; retrying shortly")
    }
    await wait(2000)
  }
} finally {
  await closeDatabase()
}
