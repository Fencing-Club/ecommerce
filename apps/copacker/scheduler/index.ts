import type { InferEnv } from "cf/config"
import type config from "./cloudflare.config"

export default {
  async scheduled(controller: { cron: string }, env: InferEnv<typeof config.worker>) {
    const signals =
      controller.cron === "* * * * *"
        ? ["amazon", "shopify", "ebay"].map((provider) => ({ kind: "notifications", provider }))
        : [{ kind: controller.cron === "0 7 * * *" ? "reconcile" : "wake" }]
    const results = await Promise.allSettled(
      signals.map((signal) => env.EXECUTOR_JOBS.send(JSON.stringify(signal), { contentType: "text" }))
    )
    const failed = results.find((result) => result.status === "rejected")
    if (failed?.status === "rejected") {
      throw failed.reason
    }
  }
}
