import { z } from "zod"
import { amazonMarketplaceSchema } from "./amazon-marketplaces"

// Private authorization supplies a marketplace and refresh token; the seller ID stays in server configuration.
export const selfAuthorizationSchema = z.object({
  marketplace: amazonMarketplaceSchema,
  refreshToken: z
    .string()
    .trim()
    .regex(/^Atzr\|\S{20,}$/, "shipments.amazonAuthorization.refreshToken")
})
