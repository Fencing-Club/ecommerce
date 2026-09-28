import { z } from "zod"

// What someone writes to Copacker about from the contact page, and the message itself. The form and the endpoint check
// the same things.
export const contactTopics = [
  "Getting started",
  "A walkthrough",
  "Support",
  "Partnerships",
  "Press",
  "Something else"
] as const

export const contactSchema = z.object({
  topic: z.enum(contactTopics),
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254)),
  company: z.string().trim().max(120).optional(),
  message: z.string().trim().min(1, "Write your message").max(5000, "Keep it under 5,000 characters")
})

export type ContactMessage = z.output<typeof contactSchema>
