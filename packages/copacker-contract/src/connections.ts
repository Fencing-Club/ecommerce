import { z } from "zod"
import {
  id,
  issueSchema,
  operationName,
  pageInfoSchema,
  pageInputSchema,
  revision,
  type OperationDescriptor
} from "./protocol.ts"
import { defineOperation } from "./registry.ts"

const provider = z.enum(["shopify", "amazon", "ebay", "amazon_ads"])
export const datasetStatusSchema = z.strictObject({
  name: z.enum(["products", "inventory", "orders", "financial_transactions", "stock_history", "ad_spend"]),
  state: z.enum(["not_started", "queued", "running", "complete", "failed"]),
  collectedWith: z.array(z.string()),
  observedAt: z.iso.datetime().nullable(),
  coveredFrom: z.iso.datetime().nullable(),
  coveredTo: z.iso.datetime().nullable(),
  issues: z.array(issueSchema)
})
export const connectionSchema = z.strictObject({
  id,
  revision,
  provider,
  accountId: z.string().nullable(),
  name: z.string(),
  state: z.enum(["connected", "authorization_required", "disconnected", "error"]),
  grantedScopes: z.array(z.string()),
  capabilities: z.array(
    z.strictObject({ operation: operationName, available: z.boolean(), reason: z.string().nullable() })
  ),
  datasets: z.array(datasetStatusSchema),
  issues: z.array(issueSchema)
})
const settings = z.discriminatedUnion("provider", [
  z.strictObject({
    provider: z.literal("shopify"),
    excludedOrderTags: z.array(z.string().trim().min(1).max(255)).max(50)
  }),
  z.strictObject({ provider: z.enum(["amazon", "ebay", "amazon_ads"]), editableFields: z.array(z.never()) })
])
const settingsResult = z.strictObject({ connectionId: id, revision, settings })
function metadata(operation: string, mutation = false) {
  return {
    operation,
    cliPath: operation.split("."),
    context: "workspace",
    effects: mutation
      ? [
          {
            kind: "local_write",
            description: "Change the Shopify order tags excluded from Copacker ingestion and reports."
          }
        ]
      : [],
    accessPolicy: {
      scopes: [mutation ? "connections:manage" : "connections:read"],
      workspaceKinds: ["buyer"],
      description: operation.includes("settings")
        ? "Current buyer owner/admin membership."
        : "Current buyer workspace membership; dataset details require their page permissions."
    },
    limits: { maxInputBytes: 1048576 },
    asyncStatusSchema: null,
    execution: { kind: mutation ? "mutation" : "query", idempotent: true, confirmation: false, readBranches: [] }
  } satisfies Omit<OperationDescriptor, "inputSchema" | "outputSchema" | "errorSchema" | "contractVersion" | "mcpName">
}
export const connectionOperations = {
  "connection.list": defineOperation(
    metadata("connection.list"),
    pageInputSchema.extend({ provider: provider.optional() }),
    z.strictObject({ items: z.array(connectionSchema), page: pageInfoSchema })
  ),
  "connection.show": defineOperation(metadata("connection.show"), z.strictObject({ id }), connectionSchema),
  "connection.settings.show": defineOperation(
    metadata("connection.settings.show"),
    z.strictObject({ id }),
    settingsResult
  ),
  "connection.settings.update": defineOperation(
    metadata("connection.settings.update", true),
    z.strictObject({
      id,
      expectedRevision: revision,
      settings: z.strictObject({
        provider: z.literal("shopify"),
        excludedOrderTags: z.array(z.string().trim().min(1).max(255)).max(50)
      })
    }),
    settingsResult
  )
}
