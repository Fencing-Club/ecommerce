import { randomUUID } from "node:crypto"
import type { ContactMessage } from "@/lib/contact"
import { sendEmail } from "@/server/email"

// Sends a message from the contact page to CONTACT_EMAIL. Replying goes straight to the person who wrote it.
export async function sendContactMessage(message: ContactMessage) {
  const to = process.env.CONTACT_EMAIL
  if (!to) {
    throw new Error("Contact email is not configured")
  }
  const oneLine = (text: string) => text.replace(/\s+/g, " ")
  const sender = message.company ? `${oneLine(message.name)}, ${oneLine(message.company)}` : oneLine(message.name)
  await sendEmail({
    to,
    replyTo: message.email,
    subject: `${message.topic}: ${sender}`,
    text: [
      message.message,
      "",
      `${message.name} <${message.email}>`,
      ...(message.company ? [message.company] : []),
      `Topic: ${message.topic}`
    ].join("\n"),
    key: randomUUID()
  })
}
