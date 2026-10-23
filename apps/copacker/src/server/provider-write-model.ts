import { providerTarget, providerWriteInput } from "@repo/copacker-contract"
import { z } from "zod"

export const writeIntent = providerWriteInput.options[0]
export const writeDestination = providerTarget.extend({
  connectionRevision: z.number().int(),
  externalId: z.string(),
  productId: z.string().nullable(),
  inventoryItemId: z.string().nullable(),
  locationExternalId: z.string().nullable(),
  quantityState: z.enum(["available", "on_hand"]).nullable(),
  listingId: z.uuid().nullable(),
  listingRevision: z.number().int().nullable(),
  linkRevision: z.number().int().nullable(),
  productType: z.string().nullable(),
  configuration: z.string(),
  lockKey: z.string(),
  submissionId: z.string().nullable(),
  attempts: z.number().int().nonnegative()
})
export const writeDestinations = z.array(writeDestination).min(1).max(101)
export type WriteDestination = z.infer<typeof writeDestination>
