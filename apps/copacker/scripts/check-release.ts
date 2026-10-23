import { z } from "zod"
import { verifyReleaseHealth } from "./release-health"

const sha = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .parse(process.env.APP_COMMIT_SHA)
for (const [origin, endpoint] of [
  [process.env.APP_URL, "/api/health"],
  [process.env.STORIES_URL, "/health.json"]
] as const) {
  const url = new URL(endpoint, z.url().parse(origin))
  await verifyReleaseHealth(url, sha)
  process.stdout.write(`${url.origin} serves ${sha}\n`)
}
