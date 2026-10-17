import { z } from "zod"
const text = z.string().trim().min(1).max(200)
export const unitMappingInput = z
  .strictObject({
    source: z.enum(["amazon", "shopify"]),
    externalAccountId: text,
    sourceProductId: text,
    shopifyDomain: text,
    variantId: text,
    piecesPerUnit: z.number().int().min(1).max(1000),
    automatic: z.boolean(),
    validFrom: z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString()),
    validTo: z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString()),
    evidence: z.string().trim().min(1).max(2000),
    supersedes: z.uuid().optional()
  })
  .refine((v) => Date.parse(v.validFrom) < Date.parse(v.validTo), "Choose an increasing validity period")
export type UnitMappingInput = z.infer<typeof unitMappingInput>
