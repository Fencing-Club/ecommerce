import { z } from "zod"

export const contractVersion = "2026-10-15"
export const operationName = z
  .string()
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/)
  .max(100)
export const id = z.uuid()
export const revision = z.number().int().nonnegative().safe()
export const jsonObject = z.record(z.string(), z.json())
export type JsonObject = z.infer<typeof jsonObject>

export const scopes = [
  "reports:read",
  "orders:read",
  "purchase-orders:read",
  "purchase-orders:write",
  "products:read",
  "products:write",
  "products:write-channel",
  "inventory:read",
  "inventory:write",
  "catalogs:read",
  "catalogs:write",
  "locations:read",
  "locations:write",
  "shipments:read",
  "shipments:write",
  "partners:read",
  "partners:write",
  "connections:read",
  "connections:manage",
  "sync:run",
  "expenses:read",
  "expenses:write",
  "prices:read"
] as const
export const scopeSchema = z.enum(scopes)

export const issueSchema = z.object({
  code: z.string(),
  path: z.array(z.union([z.string(), z.number().int()])),
  message: z.string(),
  rowId: z.string().optional(),
  entityId: id.optional()
})
export const selectorSchema = z.object({ operation: operationName, input: jsonObject })
export const failureSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  issues: z.array(issueSchema),
  recovery: selectorSchema.nullable()
})
export const errorSchema = failureSchema.extend({ details: jsonObject })
export const metaSchema = z.object({
  requestId: z.string(),
  workspaceId: id.nullable(),
  generatedAt: z.iso.datetime(),
  completeness: z.enum(["complete", "partial", "unavailable"]),
  sources: z.array(
    z.object({
      provider: z.string(),
      accountId: z.string().nullable(),
      dataset: z.string(),
      observedAt: z.iso.datetime().nullable(),
      freshness: z.enum(["current", "stale", "unknown"]),
      availability: z.enum(["available", "partial", "unavailable"]),
      staleAfter: z.iso.datetime().nullable(),
      snapshotId: z.string().nullable().optional(),
      syncId: z.string().nullable().optional(),
      coveredFrom: z.iso.datetime().nullable().optional(),
      coveredTo: z.iso.datetime().nullable().optional()
    })
  ),
  warnings: z.array(issueSchema),
  redactedFields: z.array(z.string())
})
export const errorMetaSchema = z.object({ requestId: z.string(), workspaceId: id.nullable() })
export const errorEnvelopeSchema = z.object({ error: errorSchema, meta: errorMetaSchema })
export const successEnvelopeSchema = z.object({ data: z.json(), meta: metaSchema })
export type SuccessEnvelope = z.infer<typeof successEnvelopeSchema>
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>

export const pageInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional()
})
export const pageInfoSchema = z
  .object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    consistency: z.enum(["live", "snapshot"]),
    snapshotId: id.optional()
  })
  .refine((p) => p.hasMore === (p.nextCursor !== null), "hasMore and nextCursor must agree.")
export const pageSchema = z.object({ items: z.array(z.json()), page: pageInfoSchema })
export const operationStateSchema = z.object({
  id,
  name: operationName,
  status: z.enum(["queued", "running", "succeeded", "partially_succeeded", "failed", "needs_attention", "cancelled"]),
  stage: z.string(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  error: failureSchema.nullable(),
  recovery: selectorSchema.nullable()
})
export const asyncResultSchema = z.object({ operation: operationStateSchema, statusQuery: selectorSchema })
export const artifactSchema = z.object({
  id,
  filename: z.string().min(1),
  mediaType: z.string(),
  size: z.number().int().nonnegative().nullable(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  revision: revision.nullable(),
  sourceIds: z.array(id),
  download: z.object({ url: z.string(), authentication: z.literal("required") }),
  expiresAt: z.iso.datetime().nullable()
})
export const handoffSchema = z.object({
  intentId: id,
  handoffId: id,
  expiresAt: z.iso.datetime(),
  upload: z.object({ url: z.string(), method: z.literal("PUT"), authentication: z.literal("required") })
})
export const fileMetadataSchema = z.strictObject({
  filename: z.string().min(1).max(255),
  mediaType: z.string().min(1),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
})

export const effectSchema = z.object({
  kind: z.enum(["local_write", "provider_write", "reservation", "email", "document", "credential"]),
  entityId: id.optional(),
  targetId: id.optional(),
  description: z.string()
})
export const operationSummarySchema = z.object({
  operation: operationName,
  cliPath: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).min(1),
  mcpName: z.string().nullable(),
  contractVersion: z.string(),
  context: z.enum(["account", "workspace"]),
  effects: z.array(effectSchema)
})
export const operationDescriptorSchema = operationSummarySchema.extend({
  inputSchema: jsonObject,
  outputSchema: jsonObject,
  errorSchema: jsonObject,
  accessPolicy: z.object({
    scopes: z.array(scopeSchema),
    workspaceKinds: z.array(z.enum(["buyer", "supplier", "forwarder"])),
    description: z.string()
  }),
  limits: z.object({
    maxInputBytes: z.number().int().positive().max(1048576),
    maxFileBytes: z.number().int().positive().optional()
  }),
  asyncStatusSchema: jsonObject.nullable(),
  // Execution metadata is explicit: neither HTTP POST nor the command verb determines mutability.
  execution: z.object({
    kind: z.enum(["query", "mutation"]),
    idempotent: z.boolean(),
    confirmation: z.boolean(),
    readBranches: z.array(z.object({ field: z.enum(["mode", "action"]), value: z.literal("read") })),
    csvColumns: z.array(z.string()).optional()
  })
})
export type OperationDescriptor = z.infer<typeof operationDescriptorSchema>
export type OperationSummary = z.infer<typeof operationSummarySchema>
export const requestSchema = z.strictObject({ workspaceId: id.optional(), input: jsonObject })

export const accountOperations = ["account.show", "workspace.list"] as const

/** Account bootstrap must work before workspace selection, including discovery of those two operations. */
export function usesAccountContext(operation: string, input: JsonObject): boolean {
  return accountOperations.some(
    (name) => name === operation || (operation === "schema.show" && name === input.operation)
  )
}

export function isQuery(descriptor: OperationDescriptor, input: JsonObject): boolean {
  return (
    descriptor.execution.kind === "query" ||
    descriptor.execution.readBranches.some((branch) => input[branch.field] === branch.value)
  )
}

export function exitCode(error: ErrorEnvelope["error"], status?: number): number {
  if (error.code === "partial_write") {
    return 9
  }
  if (error.code === "wait_timeout") {
    return 7
  }
  if (error.code === "incomplete_result") {
    return 8
  }
  if (error.code === "transport_error" || status === 429 || status === 502 || status === 503) {
    return 6
  }
  if (status === 401 || status === 403) {
    return 3
  }
  if (status === 404) {
    return 4
  }
  if (status === 409 || status === 410) {
    return 5
  }
  if (status === 400 || status === 422 || error.code === "invalid_input") {
    return 2
  }
  return 1
}
