import { setTimeout } from "node:timers/promises"
import { z } from "zod"

const sha = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .parse(process.env.APP_COMMIT_SHA)
const health = z.object({ commit: z.string().nullable() })
for (const [origin, endpoint] of [
  [process.env.APP_URL, "/api/health"],
  [process.env.STORIES_URL, "/health.json"]
] as const) {
  const url = new URL(endpoint, z.url().parse(origin))
  let verified = false
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
      if (response.ok && health.parse(await response.json()).commit === sha) {
        verified = true
        break
      }
      await response.body?.cancel().catch(() => undefined)
    } catch {
      /* Retry transient propagation and health failures within the release deadline. */
    }
    await setTimeout(10_000)
  }
  if (!verified) {
    throw new Error(`${url.origin} did not serve release ${sha}`)
  }
  process.stdout.write(`${url.origin} serves ${sha}\n`)
}
