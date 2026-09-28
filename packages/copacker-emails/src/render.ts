import { render, toPlainText } from "@react-email/render"
import type { ReactElement } from "react"

// One email as Resend sends it: the subject, the HTML, and the plain text for mail apps that show only text.
export type Email = { subject: string; html: string; text: string }

// html-to-text sets headings in capitals; the plain-text title keeps the subject's sentence case instead.
const plainText = { selectors: [{ selector: "h1", options: { uppercase: false } }] }

export async function renderEmail(subject: string, email: ReactElement): Promise<Email> {
  const html = await render(email)
  return { subject, html, text: toPlainText(html, plainText) }
}
