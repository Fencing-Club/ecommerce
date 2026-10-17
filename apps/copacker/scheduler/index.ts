import type { InferEnv } from "cf/config"
import type config from "./cloudflare.config"

export default {
  async scheduled(controller: { cron: string }, env: InferEnv<typeof config.worker>) {
    const results = await Promise.allSettled([
      env.JOBS.send(JSON.stringify({ kind: controller.cron === "0 7 * * *" ? "reconcile" : "wake" }), {
        contentType: "text"
      }),
      env.EXECUTOR_JOBS.send(JSON.stringify({ kind: "wake" }), { contentType: "text" })
    ])
    const failed = results.find((result) => result.status === "rejected")
    if (failed?.status === "rejected") {
      throw failed.reason
    }
  }
}
