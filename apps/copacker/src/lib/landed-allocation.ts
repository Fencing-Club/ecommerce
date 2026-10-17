import { z } from "zod"
import { inventoryAmount, inventoryMicros } from "./inventory-money"
const amount = z
  .string()
  .regex(/^-?(0|[1-9]\d{0,11})(\.\d{1,6})?$/)
  .transform((value) => inventoryAmount(inventoryMicros(value)))
export const landedChargeInput = z
  .strictObject({
    sourceReference: z.string().trim().min(1).max(200),
    sourceLine: z.string().trim().min(1).max(200),
    occurredAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
    evidence: z.string().trim().min(1).max(2000),
    supersedes: z.uuid().optional(),
    poLandedCostId: z.uuid().optional(),
    category: z.enum(["freight", "duty", "prep", "other"]),
    costBasis: z.enum(["actual", "estimated"]),
    amount,
    currency: z.string().regex(/^[A-Z]{3}$/),
    basis: z.enum(["pieces", "purchase_value", "manual"]),
    targets: z
      .array(z.strictObject({ purchaseId: z.uuid(), amount: amount.optional() }))
      .min(1)
      .max(100)
  })
  .superRefine((value, ctx) => {
    if (new Set(value.targets.map((target) => target.purchaseId)).size !== value.targets.length) {
      ctx.addIssue({ code: "custom", message: "Each purchase may appear once" })
    }
    if (value.targets.some((target) => (target.amount !== undefined) !== (value.basis === "manual"))) {
      ctx.addIssue({ code: "custom", message: "Amounts are required only for manual allocation" })
    }
  })
export type LandedChargeInput = z.infer<typeof landedChargeInput>
export type LandedAllocation = { purchaseId: string; amount: string }
// Largest remainder at six decimals, with purchase ID as the deterministic tie-breaker. Shares always equal the bill.
export function allocateLandedCharge(
  total: string,
  targets: { purchaseId: string; weight: bigint }[]
): LandedAllocation[] {
  const value = inventoryMicros(total),
    sign = value < 0n ? -1n : 1n,
    magnitude = value * sign
  const denominator = targets.reduce((sum, target) => sum + target.weight, 0n)
  if (denominator <= 0n || targets.some((target) => target.weight < 0n)) {
    throw new Error("Positive allocation weights required")
  }
  const parts = targets.map((target) => ({
    ...target,
    share: (magnitude * target.weight) / denominator,
    remainder: (magnitude * target.weight) % denominator
  }))
  let remaining = magnitude - parts.reduce((sum, part) => sum + part.share, 0n)
  for (const part of parts.toSorted((a, b) => {
    if (a.remainder === b.remainder) {
      return a.purchaseId.localeCompare(b.purchaseId)
    }
    return a.remainder > b.remainder ? -1 : 1
  })) {
    if (remaining === 0n) {
      break
    }
    part.share += 1n
    remaining -= 1n
  }
  return parts.map((part) => ({ purchaseId: part.purchaseId, amount: inventoryAmount(part.share * sign) }))
}
