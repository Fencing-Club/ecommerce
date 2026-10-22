import type { SQL } from "drizzle-orm"
import type { z } from "zod"
import type { Transaction } from "@/db"
import type { AnyJobPayload, JobInput, JobKind } from "./job-payloads"

// A job that isn't finished and should run again: after `delayMs` (30 seconds unless given), with `payload` replacing
// its payload when given, such as where to resume. A job that got further this run sets `progressed`, so the limit on
// retries counts only runs that made no headway.
export class PollAgain extends Error {
  constructor(
    message: string,
    readonly options: { delayMs?: number; payload?: AnyJobPayload; progressed?: boolean } = {}
  ) {
    super(message)
  }
}

// The attempt a handler runs in. `assertOwned` renews the lease and throws once another attempt took over, so a handler
// calls it before each side effect; `owned` is the SQL condition that matches this attempt's row while it still holds it.
export type JobContext = {
  key: string
  attempt: number
  assertOwned: () => Promise<void>
  owned: SQL
}

// Handlers are methods, so one kind's definition is also a definition of any kind, which the registry's lookup returns.
export type JobDefinition<K extends JobKind> = {
  kind: K
  // Short handlers run in the queue consumer; everything else runs in a durable Workflow.
  executor: "queue" | "workflow"
  payload: z.ZodType<JobInput<K>>
  run(input: JobInput<K>, context: JobContext): Promise<void>
  // Runs in the transaction that marks the job failed for good, with the error it failed with.
  onFailure?(tx: Transaction, input: JobInput<K>, error: string): Promise<void>
}

export function defineJob<K extends JobKind>(definition: JobDefinition<K>) {
  return definition
}
