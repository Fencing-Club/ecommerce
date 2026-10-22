import { z } from "zod"
import {
  id,
  operationDescriptorSchema,
  operationName,
  operationSummarySchema,
  pageInfoSchema,
  pageInputSchema,
  revision,
  scopeSchema,
  type OperationDescriptor
} from "./protocol.ts"
import { defineOperation } from "./registry.ts"

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\r\n]*$/)
const empty = z.strictObject({})
const workspaceKinds = ["buyer", "supplier", "forwarder"] as const
const credentialState = z.enum(["pending_delivery", "active", "expired", "revoked"])
const scopes = z
  .array(scopeSchema)
  .min(1)
  .max(50)
  .refine((values) => new Set(values).size === values.length, {
    message: "Each scope must occur once."
  })

function metadata(
  operation: string,
  description: string,
  options: {
    context?: "account" | "workspace"
    credential?: boolean
    mutation?: boolean
    confirmation?: boolean
    columns?: string[]
  } = {}
) {
  return {
    operation,
    cliPath: operation.split("."),
    context: options.context ?? "workspace",
    mcp: !options.credential,
    effects: options.mutation ? [{ kind: "credential", description }] : [],
    accessPolicy: { scopes: [], workspaceKinds: [...workspaceKinds], description },
    limits: { maxInputBytes: 1048576 },
    asyncStatusSchema: null,
    execution: {
      kind: options.mutation ? "mutation" : "query",
      idempotent: true,
      confirmation: options.confirmation ?? false,
      readBranches: [],
      ...(options.columns ? { csvColumns: options.columns } : {})
    }
  } satisfies Omit<
    OperationDescriptor,
    "inputSchema" | "outputSchema" | "errorSchema" | "contractVersion" | "mcpName"
  > & { mcp: boolean }
}

const page = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item), page: pageInfoSchema })

export const accountShow = defineOperation(
  metadata("account.show", "The authenticated principal only; no workspace selection is required.", {
    context: "account"
  }),
  empty,
  z.strictObject({
    // Identity-provider principal IDs are stable strings, not Copacker resource UUIDs.
    id: text(255),
    name: z.string().nullable(),
    email: z.email(),
    authentication: z.strictObject({
      kind: z.enum(["interactive", "automation"]),
      credentialId: id.nullable(),
      expiresAt: z.iso.datetime().nullable(),
      scopes: z.array(scopeSchema)
    }),
    workspaceId: id.nullable()
  })
)

export const schemaList = defineOperation(
  metadata("schema.list", "Live workspace membership; publish only deployed operations available to this caller.", {
    columns: ["operation", "context", "contractVersion"]
  }),
  pageInputSchema.extend({ prefix: text(100).optional() }),
  page(operationSummarySchema)
)

export const schemaShow = defineOperation(
  metadata(
    "schema.show",
    "Live workspace membership, except account.show and workspace.list bootstrap discovery; publish only authorized operations."
  ),
  z.strictObject({ operation: operationName }),
  operationDescriptorSchema
)

export const credentialSchema = z.strictObject({
  id,
  revision,
  name: text(100),
  workspaceId: id,
  principalId: text(255),
  scopes,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  state: credentialState,
  generation: z.number().int().positive().safe(),
  previousGenerationExpiresAt: z.iso.datetime().nullable(),
  pendingDeliveryExpiresAt: z.iso.datetime().nullable()
})

export const secretDeliverySchema = z.strictObject({
  id,
  expiresAt: z.iso.datetime(),
  state: z.enum(["available", "consumed", "expired"]),
  download: z.strictObject({ url: z.string().min(1), authentication: z.literal("interactive_required") })
})
export const credentialDeliverySchema = z.strictObject({ credential: credentialSchema, delivery: secretDeliverySchema })

const credentialPolicy =
  "Interactive owner/admin of the explicit workspace, checked against current membership; automation credentials cannot manage credentials."
const credentialMetadata = (name: string, mutation = false, confirmation = false, columns?: string[]) =>
  metadata(`account.credential.${name}`, credentialPolicy, { credential: true, mutation, confirmation, columns })
const guard = z.strictObject({ id, expectedRevision: revision })

export const credentialOperations = {
  "account.credential.list": defineOperation(
    credentialMetadata("list", false, false, ["id", "name", "state", "expiresAt", "lastUsedAt"]),
    pageInputSchema.extend({ state: credentialState.optional() }),
    page(credentialSchema)
  ),
  "account.credential.show": defineOperation(credentialMetadata("show"), z.strictObject({ id }), credentialSchema),
  "account.credential.create": defineOperation(
    credentialMetadata("create", true),
    z.strictObject({ name: text(100), scopes, expiresAt: z.iso.datetime() }),
    credentialDeliverySchema
  ),
  "account.credential.rotate": defineOperation(
    credentialMetadata("rotate", true),
    guard.extend({ overlapSeconds: z.number().int().min(0).max(900).default(900) }),
    credentialDeliverySchema
  ),
  "account.credential.revoke": defineOperation(
    credentialMetadata("revoke", true, true),
    guard.extend({ reason: text(255).optional() }),
    z.strictObject({ credential: credentialSchema.extend({ state: z.literal("revoked") }) })
  )
}

/** Use the application's canonical accessSchema; this package does not duplicate its page grants or permission rules. */
export function setupOperations<A extends z.ZodType>(accessSchema: A) {
  const workspace = z.strictObject({
    id,
    name: z.string().min(1),
    kind: z.enum(workspaceKinds),
    role: z.enum(["owner", "admin", "member"]),
    access: accessSchema,
    effectiveScopes: z.array(scopeSchema),
    capabilities: z.array(
      z.strictObject({ operation: operationName, available: z.boolean(), reason: z.string().nullable() })
    )
  })
  return {
    "account.show": accountShow,
    "workspace.list": defineOperation(
      metadata("workspace.list", "Current memberships of this principal; automation sees only its bound workspace.", {
        context: "account",
        columns: ["id", "name", "kind", "role"]
      }),
      pageInputSchema,
      page(workspace)
    ),
    "workspace.show": defineOperation(
      metadata("workspace.show", "Current membership and credential workspace binding; return effective grants only."),
      empty,
      workspace
    ),
    "schema.list": schemaList,
    "schema.show": schemaShow,
    ...credentialOperations
  }
}
