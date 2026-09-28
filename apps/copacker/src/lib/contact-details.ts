import { z } from "zod"
import { websiteSchema } from "./onboarding"
import { phoneSchema } from "./phone"

// A supplier's contact details as typed, any of which can be left empty: who to contact, their email and phone, and
// the supplier's website. The supplier keeps them in Settings; until it joins, its buyer keeps them on Partners. The
// forms and the server check them with this same schema.
export const contactDetailsSchema = z.object({
  contactName: z.string().trim().max(120),
  contactEmail: z.union([z.literal(""), z.email("partners.contactDetails.enterEmail").max(254)]),
  phoneNumber: phoneSchema,
  website: websiteSchema
})
