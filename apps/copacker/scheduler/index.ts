import type { InferEnv } from "cf/config"
import type config from "./cloudflare.config"

export default {
  async scheduled(controller: { cron: string }, env: InferEnv<typeof config.worker>) {
    await env.JOBS.send(JSON.stringify({ kind: controller.cron === "0 7 * * *" ? "reconcile" : "wake" }), {
      contentType: "text"
    })
  }
}
