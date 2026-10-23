import { z } from "zod"
import { type OperationDescriptor } from "./protocol.ts"
import { defineOperation } from "./registry.ts"
import {
  inventoryLocationSchema,
  locationGroupSchema,
  unassignedStockTargetSchema,
  variantStockTargetsSchema
} from "./stock-targets.ts"

export const stockTargetSelectionSchema = z.strictObject({
  accountId: z.string().min(1).max(255),
  variantId: z.string().min(1).max(255)
})
export const saveStockTargetsSchema = stockTargetSelectionSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
  targets: variantStockTargetsSchema,
  resolveImported: z.boolean().default(false)
})
export const saveLocationGroupSchema = locationGroupSchema.extend({ expectedRevision: z.number().int().nonnegative() })
export const removeLocationGroupSchema = z.strictObject({ id: z.uuid(), expectedRevision: z.number().int().positive() })
const groupResult = locationGroupSchema.extend({ revision: z.number().int().positive() })
export const stockTargetResultSchema = stockTargetSelectionSchema.extend({
  revision: z.number().int().nonnegative(),
  targets: variantStockTargetsSchema,
  unassigned: z.array(unassignedStockTargetSchema),
  locations: z.array(inventoryLocationSchema),
  groups: z.array(groupResult),
  issues: z.array(z.strictObject({ code: z.string(), targetId: z.string(), locationKey: z.string().nullable() }))
})
function metadata(operation: string, mutation = false) {
  return {
    operation,
    cliPath: operation.split("."),
    context: "workspace",
    effects: mutation
      ? [{ kind: "local_write", description: "Update variation stock targets or location groups in Copacker." }]
      : [],
    accessPolicy: {
      scopes: [mutation ? "products:write" : "products:read"],
      workspaceKinds: ["buyer"],
      description: "Current buyer membership with Product access; changes require edit access."
    },
    limits: { maxInputBytes: 1048576 },
    asyncStatusSchema: null,
    execution: { kind: mutation ? "mutation" : "query", idempotent: true, confirmation: false, readBranches: [] }
  } satisfies Omit<OperationDescriptor, "inputSchema" | "outputSchema" | "errorSchema" | "contractVersion" | "mcpName">
}
export const stockTargetOperations = {
  "variant.stock-targets.show": defineOperation(
    metadata("variant.stock-targets.show"),
    stockTargetSelectionSchema,
    stockTargetResultSchema
  ),
  "variant.stock-targets.update": defineOperation(
    metadata("variant.stock-targets.update", true),
    saveStockTargetsSchema,
    stockTargetResultSchema
  ),
  "location.group.list": defineOperation(
    metadata("location.group.list"),
    z.strictObject({}),
    z.strictObject({ items: z.array(groupResult), locations: z.array(inventoryLocationSchema) })
  ),
  "location.group.save": defineOperation(metadata("location.group.save", true), saveLocationGroupSchema, groupResult),
  "location.group.remove": defineOperation(
    metadata("location.group.remove", true),
    removeLocationGroupSchema,
    z.strictObject({ id: z.uuid() })
  )
}
