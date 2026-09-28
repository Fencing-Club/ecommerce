/** @jsxRuntime automatic */
import { Layout } from "../layout"
import { Steps } from "../parts"
import { renderEmail } from "../render"

export type InvitationProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  kind: "supplier" | "team" | "forwarder"
  // The name of the workspace that sent it.
  from: string
  // The invited address. The link signs up or signs in with it.
  to: string
  // The invitation's token, for the link.
  token: string
}

// What joining is for, and what comes after accepting, for each kind of invitation.
const invitations = {
  supplier: {
    eyebrow: "Supplier invitation",
    lead: "Join as their supplier and get their purchase orders there.",
    steps: (from: string) => [
      "Accept, and sign in or create your account",
      "Set up your supplier workspace",
      `Pack ${from}’s purchase orders and print their labels in one place`
    ]
  },
  team: {
    eyebrow: "Team invitation",
    lead: "Join their workspace.",
    steps: (from: string) => ["Accept, and sign in or create your account", `Start working in ${from}`]
  },
  forwarder: {
    eyebrow: "Forwarder invitation",
    lead: "Join as their freight forwarder and share your warehouse addresses with them.",
    steps: (from: string) => [
      "Accept, and sign in or create your account",
      "Add your warehouse addresses",
      `See the shipments ${from} sends through you`
    ]
  }
} satisfies Record<InvitationProps["kind"], { eyebrow: string; lead: string; steps: (from: string) => string[] }>

const title = ({ from }: InvitationProps) => `${from} invited you to Copacker`

export default function Invitation(props: InvitationProps) {
  const { appUrl, kind, from, to, token } = props
  const invitation = invitations[kind]
  const href = `${appUrl}/invite?token=${token}&kind=${kind}`
  return (
    <Layout
      action={{ label: "Accept invitation", href }}
      appUrl={appUrl}
      eyebrow={invitation.eyebrow}
      heading={title(props)}
      fallback
      lead={invitation.lead}
      note={`It’s for ${to} and expires in 7 days. If you weren’t expecting it, you can ignore this email.`}
      preview={invitation.lead}
      reason={`${from} invited ${to} to Copacker.`}
    >
      <Steps steps={invitation.steps(from)} />
    </Layout>
  )
}

Invitation.PreviewProps = {
  appUrl: "http://localhost:3000",
  kind: "supplier",
  from: "Fencing Club",
  to: "sales@unic.example",
  token: "preview-token"
} satisfies InvitationProps

export function invitationEmail(props: InvitationProps) {
  return renderEmail(title(props), <Invitation {...props} />)
}
