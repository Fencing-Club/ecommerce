import { z } from "zod"

const addressKeys = ["addressLine1", "city", "stateOrRegion", "postalCode", "countryCode"] as const

// A buyer's business details, printed at the top of its POs. All optional, but an address is all or nothing.
export const businessProfileSchema = z
  .object({
    contactName: z.string().trim().max(120),
    contactEmail: z.union([z.email({ error: "Enter a valid email" }).max(254), z.literal("")]),
    phoneNumber: z.string().trim().max(50),
    website: z.union([
      z.url({ protocol: /^https?$/, error: "Enter a full address, starting https://" }),
      z.literal("")
    ]),
    addressLine1: z.string().trim().max(180),
    addressLine2: z.string().trim().max(60),
    city: z.string().trim().max(50),
    stateOrRegion: z.string().trim().max(50),
    postalCode: z.string().trim().max(20),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^([A-Z]{2})?$/, "Enter a two-letter code, such as US")
  })
  .superRefine((value, ctx) => {
    if (!addressKeys.some((key) => value[key]) && !value.addressLine2) {
      return
    }
    for (const key of addressKeys) {
      if (!value[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: "Needed for the address" })
      }
    }
  })
