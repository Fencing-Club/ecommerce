import { amazonMarketplaceSchema } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { z } from "zod"

// Private authorization supplies a marketplace and refresh token; the seller ID stays in server configuration.
export const selfAuthorizationSchema = z.object({
  marketplace: amazonMarketplaceSchema,
  refreshToken: z
    .string()
    .trim()
    .regex(/^Atzr\|\S{20,}$/, "shipments.amazonAuthorization.refreshToken")
})
