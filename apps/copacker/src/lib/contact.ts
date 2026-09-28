import { z } from "zod"

// What someone writes to Copacker about from the contact page, and the message itself. The form and the endpoint check
// the same things. A topic is sent in English, for whoever reads the message at Copacker; the form shows each in the
// visitor's language (marketing.contact.form.topics).
export const contactTopics = [
  "Getting started",
  "A walkthrough",
  "Support",
  "Partnerships",
  "Press",
  "Something else"
] as const
export type ContactTopic = (typeof contactTopics)[number]

export const contactSchema = z.object({
  topic: z.enum(contactTopics),
  name: z.string().trim().min(1, "marketing.contact.form.enterName").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("marketing.contact.form.enterEmail").max(254)),
  company: z.string().trim().max(120).optional(),
  message: z.string().trim().min(1, "marketing.contact.form.writeMessage").max(5000, "marketing.contact.form.tooLong")
})

export type ContactMessage = z.output<typeof contactSchema>
