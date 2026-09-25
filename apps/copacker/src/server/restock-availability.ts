import { z } from "zod"

const signed = z.number().int().safe().nullable()
const nonnegative = z.number().int().nonnegative().safe().nullable()
const availabilitySchema = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("shopify"), available: signed, committed: nonnegative, onHand: signed }),
  z.strictObject({
    source: z.literal("fba"),
    fulfillableQuantity: nonnegative,
    pendingCustomerOrderQuantity: nonnegative,
    totalQuantity: nonnegative
  }),
  z.strictObject({
    source: z.literal("awd"),
    availableDistributable: nonnegative,
    reservedDistributable: nonnegative,
    onHand: nonnegative
  })
])

// Provider availability already excludes its allocated inventory. Committed/open orders are explanatory data,
// never an additional deduction here. Unknown availability must not fall back to total/on-hand inventory.
export function restockAvailability(raw: unknown) {
  const input = availabilitySchema.parse(raw)
  if (input.source === "shopify") {
    return { source: input.source, available: input.available, allocated: input.committed, basis: "available" as const }
  }
  if (input.source === "fba") {
    return {
      source: input.source,
      available: input.fulfillableQuantity,
      allocated: input.pendingCustomerOrderQuantity,
      basis: "fulfillableQuantity" as const
    }
  }
  return {
    source: input.source,
    available: input.availableDistributable,
    allocated: input.reservedDistributable,
    basis: "availableDistributable" as const
  }
}
