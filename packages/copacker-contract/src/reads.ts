import { z } from "zod"
import { id, pageInfoSchema, pageInputSchema, revision, type OperationDescriptor } from "./protocol.ts"
import { defineOperation } from "./registry.ts"

export function readMetadata(
  operation: string,
  scopes: OperationDescriptor["accessPolicy"]["scopes"],
  workspaceKinds: ("buyer" | "supplier" | "forwarder")[]
) {
  return {
    operation,
    cliPath: operation.split("."),
    context: "workspace",
    effects: [],
    accessPolicy: {
      scopes,
      workspaceKinds,
      description: "Current workspace membership and the corresponding page permission; monetary fields require Prices."
    },
    limits: { maxInputBytes: 1048576 },
    asyncStatusSchema: null,
    execution: { kind: "query", idempotent: true, confirmation: false, readBranches: [] }
  } satisfies Omit<OperationDescriptor, "inputSchema" | "outputSchema" | "errorSchema" | "contractVersion" | "mcpName">
}
export const readQuery = z.string().trim().min(1).max(500)
export const partnerType = z.enum(["supplier", "forwarder", "customer"])
const partner = z.strictObject({
  id,
  type: partnerType,
  name: z.string(),
  relationshipStatus: z.enum(["joined", "invited", "expired", "not_invited"]),
  email: z.string().nullable(),
  addressIds: z.array(id),
  catalogId: id.nullable(),
  leadTimeDays: z.number().int().nullable(),
  // Relationships do not yet have transactional revisions. Do not supply an invented write guard.
  revision: revision.nullable(),
  allowedActions: z.array(z.string())
})
export const partnerReadOperations = {
  "partners.list": defineOperation(
    readMetadata("partners.list", ["partners:read"], ["buyer", "supplier"]),
    pageInputSchema.extend({
      type: partnerType.optional(),
      query: readQuery.optional(),
      joined: z.boolean().optional()
    }),
    z.strictObject({ items: z.array(partner), page: pageInfoSchema })
  ),
  "partners.show": defineOperation(
    readMetadata("partners.show", ["partners:read"], ["buyer", "supplier"]),
    z.strictObject({ id, type: partnerType.optional() }),
    partner
  )
}

// Domain schemas are supplied by the application, keeping one definition for pricing and PO lines.
export function catalogReadOperations<P extends z.ZodType, Q extends z.ZodType>(priceBreak: P, quantityRules: Q) {
  const catalog = z.strictObject({
    id,
    revision,
    title: z.string(),
    status: z.enum(["active", "draft", "archived"]),
    adjustmentBasisPoints: z.number().int(),
    includeNewProducts: z.boolean(),
    customerIds: z.array(id),
    products: z.array(
      z.strictObject({
        variantId: id,
        priceMinor: z.number().int().nullable(),
        priceBreaks: z.array(priceBreak).nullable(),
        quantityRules: quantityRules.nullable()
      })
    ),
    allowedActions: z.array(z.string())
  })
  return {
    "catalog.list": defineOperation(
      readMetadata("catalog.list", ["catalogs:read"], ["supplier"]),
      pageInputSchema.extend({
        status: z.enum(["active", "draft", "archived"]).optional(),
        query: readQuery.optional()
      }),
      z.strictObject({ items: z.array(catalog), page: pageInfoSchema })
    ),
    "catalog.show": defineOperation(
      readMetadata("catalog.show", ["catalogs:read"], ["supplier"]),
      z.strictObject({ id }),
      catalog
    )
  }
}

export function poReadOperations<L extends z.ZodType>(line: L) {
  const po = z.strictObject({
    id,
    revision,
    state: z.enum(["draft", "sent", "closed"]),
    reference: z.string(),
    supplierId: id,
    destination: z.enum(["amazon", "warehouse"]),
    deliveryId: id.nullable(),
    via: z.strictObject({ forwarderId: id, addressId: id }).nullable(),
    currency: z.string(),
    dueDate: z.iso.date().nullable(),
    readyDate: z.iso.date().nullable(),
    paymentTerms: z.string().nullable(),
    notes: z.string(),
    lines: z.array(line),
    adjustments: z.array(z.strictObject({ description: z.string(), amountMinor: z.number().int() })).nullable(),
    shipmentIds: z.array(id),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    allowedActions: z.array(z.string())
  })
  return {
    "po.list": defineOperation(
      readMetadata("po.list", ["purchase-orders:read"], ["buyer", "supplier", "forwarder"]),
      pageInputSchema.extend({
        state: z.enum(["draft", "sent", "closed"]).optional(),
        supplierId: id.optional(),
        destination: z.enum(["amazon", "warehouse"]).optional(),
        dueFrom: z.iso.date().optional(),
        dueTo: z.iso.date().optional(),
        query: readQuery.optional(),
        sort: z.enum(["createdAt", "dueDate"]).default("createdAt"),
        direction: z.enum(["asc", "desc"]).default("desc")
      }),
      z.strictObject({ items: z.array(po), page: pageInfoSchema })
    ),
    "po.show": defineOperation(
      readMetadata("po.show", ["purchase-orders:read"], ["buyer", "supplier", "forwarder"]),
      z.strictObject({ id }),
      po
    )
  }
}
