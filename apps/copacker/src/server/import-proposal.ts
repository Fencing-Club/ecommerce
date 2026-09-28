import { z } from "zod"

const money = z
  .string()
  .regex(/^-?\d{1,10}(\.\d{1,4})?$/)
  .nullable()
const quantity = z.number().positive().max(1000000).nullable()
const variantId = z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/)
export const importProposalSchema = z
  .object({
    reference: z.string().max(80).nullable(),
    currency: z.enum(["USD", "CNY", "EUR", "GBP", "CAD", "AUD"]).nullable(),
    items: z
      .array(
        z
          .object({
            description: z.string().min(1).max(1000),
            sourceSku: z.string().max(255).nullable(),
            sourcePage: z.number().int().min(1).max(50).nullable(),
            sourceQuantity: quantity,
            sourceUnit: z.string().max(80).nullable(),
            sourceUnitPrice: money,
            sourceLineTotal: money,
            selectedVariantId: variantId.nullable(),
            candidateVariantIds: z.array(variantId).max(20),
            pieces: z.number().int().positive().max(1000000).nullable(),
            piecesPerSet: z.number().int().positive().max(1000).nullable(),
            pricePerPiece: money,
            reason: z.string().max(1000),
            warnings: z.array(z.string().max(1000)).max(20)
          })
          .strict()
      )
      .min(1)
      .max(150),
    adjustments: z
      .array(
        z
          .object({
            description: z.string().min(1).max(255),
            amount: money,
            sourcePage: z.number().int().min(1).max(50)
          })
          .strict()
      )
      .max(50),
    documentTotal: money,
    warnings: z.array(z.string().max(1000)).max(50)
  })
  .strict()
export type ImportProposal = z.infer<typeof importProposalSchema>

// Reject invented catalog IDs even when the model returns schema-valid JSON.
export function validateProposal(raw: unknown, knownVariants: ReadonlySet<string>) {
  const proposal = importProposalSchema.parse(raw)
  for (const item of proposal.items) {
    const ids = [...item.candidateVariantIds, ...(item.selectedVariantId ? [item.selectedVariantId] : [])]
    if (ids.some((id) => !knownVariants.has(id))) {
      throw new Error("Import referenced an unverified catalog product")
    }
    if (item.pieces !== null && item.piecesPerSet !== null && item.pieces % item.piecesPerSet !== 0) {
      item.warnings.push("Quantity does not form complete sellable sets. Review the pack conversion.")
    }
  }
  return proposal
}

export function priceInMinorUnits(value: string) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) {
    throw new Error("Enter a nonnegative price with at most two decimal places")
  }
  const [whole, fraction = ""] = value.split(".")
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  if (!Number.isSafeInteger(result) || result > 100000000) {
    throw new Error("Price exceeds the purchase order limit")
  }
  return result
}
