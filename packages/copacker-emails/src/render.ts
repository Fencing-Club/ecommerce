import { render, toPlainText } from "@react-email/render"
import type { ReactElement } from "react"

// One email as Resend sends it: the subject, the HTML, and the plain text for mail apps that show only text.
export type Email = { subject: string; html: string; text: string }

// How the plain text differs from html-to-text's defaults: the title keeps the subject's sentence case instead of
// capitals, a row of label and value takes one line with no blank line between rows, and the footer's name leaves out
// its link, which is only the app's address.
const plainText = {
  selectors: [
    { selector: "h1", options: { uppercase: false, leadingLineBreaks: 2 } },
    {
      selector: '[data-text-format="dataTable"]',
      format: "dataTable",
      options: { leadingLineBreaks: 1, trailingLineBreaks: 1 }
    },
    { selector: "a.cp-home", format: "anchor", options: { ignoreHref: true } }
  ]
}

export async function renderEmail(subject: string, email: ReactElement): Promise<Email> {
  const html = await render(email)
  return { subject, html, text: toPlainText(html, plainText) }
}
