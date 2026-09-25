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
  // Stock to keep beyond lead-time demand, such as the Amazon stock target (Aisle's "residual" basis).
  targetStock: quantity.nonnegative().nullable().default(null),
  // The smallest order worth placing; a need above zero is raised to it before rounding to cases, as in Aisle.
  minimumOrder: quantity.positive().nullable().default(null),
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
      BigInt(input.soldUnits) * BigInt(settings.leadTimeDays) +
      BigInt(input.targetStock ?? 0) * window -
      (BigInt(input.available) + BigInt(incoming)) * window
    const multiple = BigInt(input.caseQuantity ?? 1)
    // Units needed, rounded up; then at least the minimum order; then whole cases.
    const needed = net <= 0n ? 0n : (net + window - 1n) / window
    const ordered =
      needed > 0n && input.minimumOrder !== null && needed < BigInt(input.minimumOrder)
        ? BigInt(input.minimumOrder)
        : needed
    purchaseUnits = Number(((ordered + multiple - 1n) / multiple) * multiple)
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
