import * as z from "zod/mini"

// What someone writes to Copacker about from the contact page, and the message itself. The form and the endpoint check
// the same things. A topic is sent in English, for whoever reads the message at Copacker; the form shows each in the
// visitor's language (marketing.contact.form.topics). It's written with Zod Mini, a fraction of full Zod's size, since
// the contact page's form downloads it.
export const contactTopics = [
  "Early access",
  "A walkthrough",
  "Support",
  "Partnerships",
  "Press",
  "Something else"
] as const
export type ContactTopic = (typeof contactTopics)[number]

export const contactSchema = z.object({
  topic: z.enum(contactTopics),
  name: z.string().check(z.trim(), z.minLength(1, "marketing.contact.form.enterName"), z.maxLength(120)),
  email: z.pipe(
    z.string().check(z.trim(), z.toLowerCase()),
    z.email("marketing.contact.form.enterEmail").check(z.maxLength(254))
  ),
  company: z.optional(z.string().check(z.trim(), z.maxLength(120))),
  message: z
    .string()
    .check(
      z.trim(),
      z.minLength(1, "marketing.contact.form.writeMessage"),
      z.maxLength(5000, "marketing.contact.form.tooLong")
    )
})

export type ContactMessage = z.output<typeof contactSchema>
