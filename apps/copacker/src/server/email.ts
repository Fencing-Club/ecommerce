// Sends one email through Resend. `key` is Resend's idempotency key, so sending the same email again, such as when a
// job retries, doesn't deliver it twice. `replyTo`, when there is one, is where replies go instead of the sender.
export async function sendEmail(email: {
  to: string
  subject: string
  text: string
  key: string
  replyTo?: string
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
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      attachments: email.attachments ?? []
    }),
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    throw new Error(`Email provider rejected delivery (${response.status})`)
  }
}
