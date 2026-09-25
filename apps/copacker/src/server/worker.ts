import { setTimeout as wait } from "node:timers/promises"
import { runNextJob } from "./queue"
let stopped = false
process.on("SIGTERM", () => {
  stopped = true
})
process.on("SIGINT", () => {
  stopped = true
})
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
process.exit(0)
