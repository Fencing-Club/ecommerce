import { setTimeout } from "node:timers/promises"
import { z } from "zod"

const health = z.object({ commit: z.string().nullable() })
export async function verifyReleaseHealth(url: URL, sha: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
      if (response.ok && health.parse(await response.json()).commit === sha) {
        return
      }
      await response.body?.cancel().catch(() => undefined)
    } catch {
      /* Retry transient propagation and health failures within the release deadline. */
    }
    if (attempt < 29) {
      await setTimeout(10_000)
    }
  }
  throw new Error(`${url.origin} did not serve release ${sha}`)
}
