import { emailConfig } from "./integration-config"
import { providerRequest } from "./provider-request"

// Sends one email through Resend. `key` is Resend's idempotency key, so sending the same email again, such as when a
// job retries, doesn't deliver it twice. `replyTo`, when there is one, is where replies go instead of the sender.
// `html`, when there is one, is what mail apps show, and `text` what they show when they show only text. `headers` go on
// the message itself, such as List-Unsubscribe.
export async function sendEmail(email: {
  to: string
  subject: string
  html?: string
  text: string
  key: string
  replyTo?: string
  headers?: Record<string, string>
  attachments?: Array<{ filename: string; content: string }>
}) {
  const config = emailConfig()
  if (!config) {
    throw new Error("Email sender is not configured")
  }
  await providerRequest("Resend", "https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      "Idempotency-Key": email.key
    },
    body: JSON.stringify({
      from: config.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      ...(email.headers ? { headers: email.headers } : {}),
      attachments: email.attachments ?? []
    }),
    timeoutMs: 30000
  })
}
