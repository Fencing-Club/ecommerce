import { z } from "zod"

// A new supplier or forwarder: its company name, which the server needs two characters of when it's added or a
// forwarder is renamed, and an email to invite it now, which can be left empty.
export const newPartnerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email().max(254), z.literal("")])
})

// The email an invitation to a supplier or forwarder goes to.
export const inviteSchema = z.object({ email: z.email().max(254) })
