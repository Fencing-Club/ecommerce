import { createHash, randomUUID } from "node:crypto"
import invariant from "tiny-invariant"
import { z } from "zod"

export const terraformEnvironment = z.enum(["staging", "production"])
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const commit = z.string().regex(/^[a-f0-9]{40}$/)
const runId = z.string().regex(/^[1-9]\d*$/)
const state = z.object({ version: z.literal(4), serial: z.number().int().nonnegative(), lineage: z.string().guid() })

export const planRecord = z.object({
  environment: terraformEnvironment,
  commit,
  runId,
  attempt: runId,
  createdAt: z.iso.datetime(),
  sha256: digest,
  stateSha256: digest
})
type PlanRecord = z.infer<typeof planRecord>

export type PrivateStore = {
  read: (key: string) => Promise<Buffer>
  write: (key: string, bytes: Buffer) => Promise<void>
}

export function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex")
}

export function planPrefix(environment: string, id: string, attempt: string) {
  return `plans/${terraformEnvironment.parse(environment)}/${runId.parse(id)}/${runId.parse(attempt)}`
}

export async function writeVerified(store: PrivateStore, key: string, bytes: Buffer) {
  await store.write(key, bytes)
  invariant(sha256(await store.read(key)) === sha256(bytes), "Private artifact readback differs from its source")
}

// A restore drill reads the downloaded snapshot with Terraform in a local file, never over the live backend.
export async function backupState(
  store: PrivateStore,
  environment: z.infer<typeof terraformEnvironment>,
  verifyRestoredState: (bytes: Buffer) => void | Promise<void>,
  now = new Date()
) {
  const key = `copacker/${environment}/terraform.tfstate`
  const bytes = await store.read(key)
  const parsed = state.parse(JSON.parse(bytes.toString("utf8")))
  const backup = `backups/${key}/${now.toISOString().replaceAll(":", "-")}-${randomUUID()}.json`
  await writeVerified(store, backup, bytes)
  const restored = await store.read(backup)
  await verifyRestoredState(restored)
  return { key: backup, sha256: sha256(bytes), serial: parsed.serial, lineage: parsed.lineage }
}

export function validateApprovedPlan(
  record: PlanRecord,
  bytes: Buffer,
  currentState: Buffer,
  expected: { environment: string; commit: string; runId: string; attempt: string; sha256: string },
  now = new Date()
) {
  planRecord.parse(record)
  digest.parse(expected.sha256)
  invariant(
    record.environment === expected.environment &&
      record.commit === expected.commit &&
      record.runId === expected.runId &&
      record.attempt === expected.attempt,
    "The saved plan does not belong to this environment, commit and planning run"
  )
  invariant(record.sha256 === expected.sha256 && sha256(bytes) === record.sha256, "The approved plan digest differs")
  const age = now.getTime() - Date.parse(record.createdAt)
  invariant(age >= 0 && age <= 2 * 60 * 60 * 1000, "The saved plan is expired; create and review a fresh plan")
  invariant(sha256(currentState) === record.stateSha256, "State changed after planning; create a fresh plan")
}

// Summaries contain addresses and actions only. Values, outputs and provider diagnostics remain in private R2.
export function planSummary(input: unknown) {
  const plan = z
    .object({
      resource_changes: z
        .array(z.object({ address: z.string(), change: z.object({ actions: z.array(z.string()) }) }))
        .default([])
    })
    .parse(input)
  return plan.resource_changes
    .filter((item) => item.change.actions.some((action) => action !== "no-op"))
    .map((item) => ({ address: item.address, actions: item.change.actions }))
}
