/** @jsxRuntime automatic */
import { Layout } from "../layout"
import { renderEmail } from "../render"

export type PasswordResetProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  // The link to Copacker's reset page, with its token.
  link: string
  // How long the link lasts, such as "15 minutes".
  expiresIn: string
  to: string
}

const title = () => "Reset your Copacker password"

export default function PasswordReset(props: PasswordResetProps) {
  const { appUrl, link, expiresIn, to } = props
  return (
    <Layout
      action={{ label: "Choose a new password", href: link }}
      appUrl={appUrl}
      eyebrow="Your account"
      fallback
      heading="Reset your password"
      lead={`Choose a new password for ${to}.`}
      note={`The link expires in ${expiresIn}. If you didn’t ask to reset your password, you can ignore this email; your password stays the same.`}
      preview={`Choose a new password for ${to}. The link expires in ${expiresIn}.`}
      reason={`Someone asked to reset the password for ${to} on Copacker.`}
    />
  )
}

PasswordReset.PreviewProps = {
  appUrl: "http://localhost:3000",
  link: "http://localhost:3000/reset-password?token=preview-token",
  expiresIn: "15 minutes",
  to: "andrew@fencing.club"
} satisfies PasswordResetProps

export function passwordResetEmail(props: PasswordResetProps) {
  return renderEmail(title(), <PasswordReset {...props} />)
}
