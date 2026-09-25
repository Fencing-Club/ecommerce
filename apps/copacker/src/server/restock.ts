import { z } from "zod"

const quantity = z.number().int().safe()
export const restockSettingsSchema = z.strictObject({
  leadTimeDays: z.number().int().min(1).max(730).default(56),
  salesWindowDays: z.number().int().min(1).max(730).default(56),
  includeIncoming: z.boolean().default(true)
})
const inputSchema = z.strictObject({
  available: quantity.nullable(),
  verifiedIncoming: quantity.nonnegative().nullable(),
  soldUnits: quantity.nonnegative().nullable(),
  caseQuantity: quantity.positive().nullable(),
  unitCostMinor: quantity.nonnegative().nullable(),
  stocked: z.boolean(),
  // Sales, stock, incoming, case size and cost must all refer to the same sellable unit.
  unitsVerified: z.boolean()
})

export function restockRecommendation(raw: unknown, settingsInput: unknown) {
  const input = inputSchema.parse(raw),
    settings = restockSettingsSchema.parse(settingsInput)
  const unitsPerDay = input.soldUnits === null ? null : input.soldUnits / settings.salesWindowDays
  const daysRemaining =
    input.available === null || unitsPerDay === null || unitsPerDay === 0
      ? null
      : Math.max(0, input.available) / unitsPerDay
  let demandState: "unknown" | "no_sales" | "observed" = "observed"
  if (unitsPerDay === null) {
    demandState = "unknown"
  } else if (unitsPerDay === 0) {
    demandState = "no_sales"
  }
  const outOfStock = input.available === null ? null : input.available <= 0
  const blocked = []
  if (input.available === null) {
    blocked.push("stock_unknown")
  }
  if (unitsPerDay === null) {
    blocked.push("demand_unknown")
  }
  if (!input.unitsVerified) {
    blocked.push("units_unverified")
  }
  if (settings.includeIncoming && input.verifiedIncoming === null) {
    blocked.push("incoming_unknown")
  }
  let purchaseUnits: number | null = null
  let caseCount: number | null = null
  let estimatedCostMinor: number | null = null
  if (!input.stocked) {
    purchaseUnits = 0
  } else if (blocked.length === 0 && input.available !== null && input.soldUnits !== null) {
    // Integer ratios avoid ordering an extra case when floating-point division lands just above a whole unit.
    const window = BigInt(settings.salesWindowDays)
    const incoming = settings.includeIncoming ? (input.verifiedIncoming ?? 0) : 0
    const net =
      BigInt(input.soldUnits) * BigInt(settings.leadTimeDays) - (BigInt(input.available) + BigInt(incoming)) * window
    const multiple = BigInt(input.caseQuantity ?? 1)
    const denominator = window * multiple
    purchaseUnits = Number(net <= 0n ? 0n : ((net + denominator - 1n) / denominator) * multiple)
    if (!Number.isSafeInteger(purchaseUnits)) {
      throw new Error("Restock quantity exceeds the supported range")
    }
    if (input.caseQuantity !== null) {
      caseCount = purchaseUnits / input.caseQuantity
    }
  }
  if (purchaseUnits === 0) {
    estimatedCostMinor = 0
  } else if (purchaseUnits !== null && input.unitCostMinor !== null) {
    estimatedCostMinor = purchaseUnits * input.unitCostMinor
    if (!Number.isSafeInteger(estimatedCostMinor)) {
      throw new Error("Restock cost exceeds the supported range")
    }
  }
  return {
    settings,
    unitsPerDay,
    unitsPerWeek: unitsPerDay === null ? null : unitsPerDay * 7,
    daysRemaining,
    outOfStock,
    stockoutBeforeArrival: daysRemaining === null ? null : daysRemaining < settings.leadTimeDays,
    purchaseUnits,
    caseCount,
    estimatedCostMinor,
    blocked,
    demandState
  }
}
