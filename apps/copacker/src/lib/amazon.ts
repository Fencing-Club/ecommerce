import { z } from "zod"

// A self-authorization: the seller's merchant token and the refresh token Amazon issues when the seller authorizes
// Copacker's app from the Solution Provider Portal.
export const selfAuthorizationSchema = z.object({
  sellerId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8,32}$/, "shipments.amazonAuthorization.sellerId"),
  refreshToken: z
    .string()
    .trim()
    .regex(/^Atzr\|\S{20,}$/, "shipments.amazonAuthorization.refreshToken")
})
