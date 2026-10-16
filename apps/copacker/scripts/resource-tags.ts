import invariant from "tiny-invariant"
import { z } from "zod"

export const tagTarget = z.object({
  type: z.enum(["worker", "queue", "r2_bucket"]),
  id: z.string().min(1),
  tags: z.record(z.string(), z.string())
})
type Run = (args: string[], body?: unknown) => unknown
const snapshot = z.object({
  etag: z.string().min(1),
  tags: z.record(z.string(), z.string())
})

// Read/merge/conditional-write preserves other owners' tags. A conflict fails closed and can be retried.
export function reconcileResourceTags(target: z.infer<typeof tagTarget>, run: Run) {
  const read = () =>
    snapshot.parse(run(["account-tags", "get", "--resource-type", target.type, "--resource-id", target.id]))
  const current = read()
  const matches = (tags: Record<string, string>) =>
    Object.entries(target.tags).every(([key, value]) => tags[key] === value)
  if (matches(current.tags)) {
    return
  }
  run(["account-tags", "update", "--if-match", current.etag], {
    resource_type: target.type,
    resource_id: target.id,
    tags: { ...current.tags, ...target.tags }
  })
  invariant(matches(read().tags), "Resource tags did not persist; rerun reconciliation")
}
