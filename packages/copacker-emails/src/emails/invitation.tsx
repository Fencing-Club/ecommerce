/** @jsxRuntime automatic */
import { type EmailCopy, Layout } from "../layout"
import { Steps } from "../parts"
import { renderEmail } from "../render"

export type InvitationProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  kind: "supplier" | "team" | "forwarder"
  // The invitation's token, for the link. The link signs up or signs in with the invited address.
  token: string
  // The language the copy is written in, such as "de".
  lang: string
  // The words, already in the reader's language. The heading is the subject, such as "Fencing Club invited you to
  // Copacker", and the lead says what joining is for.
  copy: EmailCopy & {
    action: string
    // Who it's for and when it expires.
    note: string
    pasteLink: string
    // What comes after accepting.
    steps: ReadonlyArray<string>
  }
}

export default function Invitation({ appUrl, copy, kind, lang, token }: InvitationProps) {
  return (
    <Layout
      action={{ label: copy.action, href: `${appUrl}/invite?token=${token}&kind=${kind}` }}
      appUrl={appUrl}
      copy={copy}
      lang={lang}
    >
      <Steps steps={copy.steps} />
    </Layout>
  )
}

Invitation.PreviewProps = {
  appUrl: "http://localhost:3000",
  kind: "supplier",
  token: "preview-token",
  lang: "en",
  copy: {
    subject: "Fencing Club invited you to Copacker",
    eyebrow: "Supplier invitation",
    heading: "Fencing Club invited you to Copacker",
    lead: "Join as their supplier and get their purchase orders there.",
    preview: "Join as their supplier and get their purchase orders there.",
    steps: [
      "Accept, and sign in or create your account",
      "Set up your supplier workspace",
      "Pack Fencing Club’s purchase orders and print their labels in one place"
    ],
    action: "Accept invitation",
    note: "It’s for sales@unic.example and expires in 7 days. If you weren’t expecting it, you can ignore this email.",
    pasteLink: "Or paste this link into your browser:",
    reason: "Fencing Club invited sales@unic.example to Copacker.",
    tagline: "Restocking, handled."
  }
} satisfies InvitationProps

export function invitationEmail(props: InvitationProps) {
  return renderEmail(props.copy.subject, <Invitation {...props} />)
}
