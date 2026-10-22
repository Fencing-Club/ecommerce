import { z } from "zod"
import { id, issueSchema, revision, type OperationDescriptor } from "./protocol.ts"
import { defineOperation } from "./registry.ts"
import { inventoryLocationRefSchema, unassignedStockTargetSchema } from "./stock-targets.ts"

// Until canonical catalog identities land, these are explicit, workspace-scoped channel keys.
const channelId = z.string().min(1).max(255)
const days = z.number().int().min(1).max(730)
export const targetRestockSelectionSchema = z.strictObject({ days, leadTimeDays: days })
const quantity = z.number().int().safe().nullable()
const restockStatusSchema = z.enum(["stockout", "reorder", "stocked", "blocked", "not_stocked", "no_listing"])
export const restockSelectionSchema = z.strictObject({
  channelIds: z
    .array(channelId)
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate channel.")
    .optional(),
  supplierId: id.optional(),
  days: days.optional(),
  leadTimeDays: days.optional(),
  status: restockStatusSchema.optional(),
  sku: z.string().min(1).max(255).optional()
})
const restockChannelSchema = z.strictObject({
  id: channelId,
  name: z.string(),
  kind: z.enum(["amazon", "warehouse"]),
  connectionId: id.nullable(),
  locationId: z.string().nullable(),
  eligible: z.boolean(),
  issues: z.array(issueSchema)
})

// The app supplies its canonical carton schema; this package never copies packing rules.
function restockLineSchema<C extends z.ZodType>(casePack: C) {
  return z.strictObject({
    variantId: z.string(),
    productId: z.string().nullable(),
    product: z.string(),
    variant: z.string().nullable(),
    sku: z.string().nullable(),
    imageUrl: z.string().nullable(),
    packOf: quantity,
    supplier: z.strictObject({ id, name: z.string() }).nullable(),
    externalSupplier: z.string().nullable(),
    status: restockStatusSchema,
    blocked: z.array(z.enum(["stock_unknown", "demand_unknown", "incoming_unknown", "sku_ambiguous"])),
    sold: quantity,
    soldAlone: quantity,
    soldInBundles: quantity,
    soldOnEbay: quantity,
    salesDays: days,
    stockoutDays: z.number().int().nonnegative(),
    rateDays: days,
    leadTimeDays: days,
    available: quantity,
    incoming: quantity,
    targetStock: quantity,
    targetWhere: z.string().nullable(),
    minimumOrder: quantity,
    caseQuantity: quantity,
    casePack: casePack.nullable(),
    need: quantity,
    purchaseUnits: quantity,
    caseCount: quantity,
    unitCostMinor: quantity,
    costCurrency: z.string().nullable(),
    estimatedCostMinor: quantity,
    daysRemaining: quantity,
    priceMinor: quantity,
    priceCurrency: z.string().nullable(),
    lostDays: quantity,
    lostUnits: quantity,
    lostSalesMinor: quantity,
    lostProfitMinor: quantity
  })
}
export function restockOperations<C extends z.ZodType>(casePack: C) {
  const report = z.strictObject({
    reportId: id,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    settings: z.strictObject({ days, leadTimeDays: days }),
    identityBasis: z.literal("provider"),
    targetBasis: z.literal("pooled"),
    channels: z.array(restockChannelSchema),
    rows: z.array(
      restockLineSchema(casePack).extend({
        rowId: id,
        channelId,
        source: z.strictObject({
          provider: z.literal("shopify"),
          connectionId: id,
          accountId: z.string(),
          variantId: z.string(),
          productId: z.string().nullable()
        }),
        explanation: z.strictObject({
          rawNeed: quantity,
          leadTimeOrigin: z.enum(["supplier", "workspace", "request"]),
          inventorySnapshotIds: z.array(id),
          openPoIds: z.array(id),
          issues: z.array(issueSchema)
        })
      })
    ),
    dependencies: z.array(z.strictObject({ kind: z.literal("inventory_snapshot"), id, revision })),
    coverage: z.array(
      z.strictObject({
        provider: z.string(),
        coveredFrom: z.iso.datetime().nullable(),
        coveredTo: z.iso.datetime().nullable(),
        available: z.boolean(),
        gapUnits: z.number().nonnegative(),
        gapReasons: z.record(
          z.string(),
          z.strictObject({ units: z.number().nonnegative(), unknownCount: z.number().int().nonnegative() })
        )
      })
    )
  })
  function metadata(operation: string) {
    return {
      operation,
      cliPath: operation.split("."),
      context: "workspace",
      effects: [],
      accessPolicy: {
        scopes: ["reports:read"],
        workspaceKinds: ["buyer"],
        description: "Current buyer membership with Restock access; monetary fields require Prices access."
      },
      limits: { maxInputBytes: 1048576 },
      asyncStatusSchema: null,
      execution: {
        kind: "query",
        idempotent: true,
        confirmation: false,
        readBranches: [],
        ...(operation === "report.restock"
          ? {
              csvColumns: [
                "channelId",
                "sku",
                "product",
                "status",
                "available",
                "incoming",
                "sold",
                "need",
                "purchaseUnits",
                "caseCount",
                "estimatedCostMinor",
                "costCurrency"
              ]
            }
          : {})
      }
    } satisfies Omit<
      OperationDescriptor,
      "inputSchema" | "outputSchema" | "errorSchema" | "contractVersion" | "mcpName"
    >
  }
  return {
    "report.restock.targets": defineOperation(
      metadata("report.restock.targets"),
      targetRestockSelectionSchema,
      z.strictObject({
        settings: targetRestockSelectionSchema,
        rows: z.array(
          z.strictObject({
            variantId: z.string(),
            targetId: id,
            members: z.array(inventoryLocationRefSchema),
            issues: z.array(z.string()),
            line: restockLineSchema(casePack).nullable()
          })
        ),
        unassigned: z.array(z.strictObject({ variantId: z.string(), values: z.array(unassignedStockTargetSchema) }))
      })
    ),
    "restock.channel.list": defineOperation(
      metadata("restock.channel.list"),
      z.strictObject({}),
      z.strictObject({ items: z.array(restockChannelSchema) })
    ),
    "report.restock": defineOperation(metadata("report.restock"), restockSelectionSchema, report)
  }
}
