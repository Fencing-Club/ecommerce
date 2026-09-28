/** @jsxRuntime automatic */
import { type EmailCopy, Layout } from "../layout"
import { renderEmail } from "../render"

export type PasswordResetProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  // The link to Copacker's reset page, with its token.
  link: string
  // The language the copy is written in, such as "de".
  lang: string
  // The words, already in the reader's language.
  copy: EmailCopy & {
    action: string
    // When the link expires, and that the password stays the same if the reader didn't ask.
    note: string
    pasteLink: string
  }
}

export default function PasswordReset({ appUrl, copy, lang, link }: PasswordResetProps) {
  return <Layout action={{ label: copy.action, href: link }} appUrl={appUrl} copy={copy} lang={lang} />
}

PasswordReset.PreviewProps = {
  appUrl: "http://localhost:3000",
  link: "http://localhost:3000/reset-password?token=preview-token",
  lang: "en",
  copy: {
    subject: "Reset your Copacker password",
    eyebrow: "Your account",
    heading: "Reset your password",
    lead: "Choose a new password for andrew@fencing.club.",
    preview: "Choose a new password for andrew@fencing.club.",
    action: "Choose a new password",
    note: "The link expires in 15 minutes. If you didn’t ask to reset your password, you can ignore this email; your password stays the same.",
    pasteLink: "Or paste this link into your browser:",
    reason: "Someone asked to reset the password for andrew@fencing.club on Copacker.",
    tagline: "Restocking, handled."
  }
} satisfies PasswordResetProps

export function passwordResetEmail(props: PasswordResetProps) {
  return renderEmail(props.copy.subject, <PasswordReset {...props} />)
}
