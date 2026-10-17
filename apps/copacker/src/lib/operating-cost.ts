import { z } from "zod"
const reference = z.string().trim().min(1).max(200)
export const operatingCostInput = z.strictObject({
  sourceReference: reference,
  sourceLine: reference,
  occurredAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s).toISOString()),
  category: z.enum([
    "outbound_shipping",
    "return_shipping",
    "pick_pack",
    "packaging",
    "warehouse",
    "gateway",
    "dispute",
    "advertising",
    "awd_storage",
    "awd_processing",
    "awd_transport",
    "other"
  ]),
  amount: z.string().regex(/^-?(0|[1-9]\d{0,11})(\.\d{1,6})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  costBasis: z.enum(["actual", "estimated"]),
  evidence: z.string().trim().min(1).max(2000),
  attribution: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("order"), salesOrderId: z.uuid() }),
    z.strictObject({ kind: z.literal("product"), shopifyDomain: reference, variantId: reference }),
    z.strictObject({ kind: z.literal("shared"), reason: reference })
  ]),
  supersedes: z.uuid().optional()
})
export type OperatingCostInput = z.infer<typeof operatingCostInput>
