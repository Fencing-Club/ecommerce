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
  if (!process.env.EMAIL_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error("Email sender is not configured")
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
      "content-type": "application/json",
      "Idempotency-Key": email.key
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      ...(email.headers ? { headers: email.headers } : {}),
      attachments: email.attachments ?? []
    }),
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    throw new Error(`Email provider rejected delivery (${response.status})`)
  }
}
