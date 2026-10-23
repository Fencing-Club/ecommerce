import { z } from "zod"
import { asyncResultSchema, id, revision } from "./protocol.ts"

const amount = z.number().int().min(0).max(2147483647)
const quantity = z.number().int().min(0).max(2147483647)
export const providerChange = z.discriminatedUnion("field", [
  z.strictObject({
    field: z.literal("sku"),
    sku: z.string().trim().min(1).max(255),
    expectedSku: z.string().nullable().optional()
  }),
  z.strictObject({
    field: z.literal("cost"),
    amountMinor: amount,
    currency: z.literal("USD"),
    expectedAmountMinor: amount.nullable().optional()
  }),
  z.strictObject({
    field: z.literal("price"),
    amountMinor: amount,
    currency: z.literal("USD"),
    expectedAmountMinor: amount.optional(),
    targetPrices: z
      .array(z.strictObject({ listingId: id, amountMinor: amount, currency: z.literal("USD") }))
      .max(100)
      .default([])
  }),
  z.strictObject({
    field: z.literal("inventory"),
    locationId: z.string().min(1),
    quantityState: z.enum(["available", "on_hand"]),
    quantity,
    expectedQuantity: z.number().int().min(-2147483648).max(2147483647).optional(),
    reason: z.string().min(1).max(500).default("correction")
  })
])
export const providerWriteInput = z.union([
  z.strictObject({
    mode: z.enum(["preview", "direct"]),
    variantId: z.string().min(1),
    expectedConnectionRevision: revision.optional(),
    expectedLinks: z
      .array(z.strictObject({ id, revision, linkRevision: revision }))
      .max(100)
      .default([]),
    change: providerChange
  }),
  z.strictObject({ mode: z.literal("apply"), previewId: id, variantId: z.string().optional() }),
  z.strictObject({ mode: z.literal("read"), executionId: id })
])
export const providerTarget = z.strictObject({
  id: z.string(),
  provider: z.enum(["shopify", "amazon"]),
  accountId: z.string(),
  connectionId: id,
  field: z.enum(["sku", "cost", "price", "inventory"]),
  role: z.enum(["source", "target"]),
  before: z.union([z.string(), z.number(), z.null()]),
  desired: z.union([z.string(), z.number()]),
  currency: z.literal("USD").nullable(),
  unit: z.string().nullable(),
  state: z.enum(["pending", "dispatching", "accepted", "confirmed", "failed", "outcome_unknown", "superseded"]),
  issue: z.string().nullable()
})
export const providerWriteResult = z.union([
  z.strictObject({
    previewId: id,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    targets: z.array(providerTarget)
  }),
  asyncResultSchema.extend({ targets: z.array(providerTarget) }).strict()
])
