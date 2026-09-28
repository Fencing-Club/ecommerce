/** @jsxRuntime automatic */
import { Layout, Paragraph } from "../layout"
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

// What joining is for, for each kind of invitation.
const joining = {
  supplier: "Join as their supplier and get their purchase orders there.",
  team: "Join their workspace.",
  forwarder: "Join as their freight forwarder and share your warehouse addresses with them."
} satisfies Record<InvitationProps["kind"], string>

const title = ({ from }: InvitationProps) => `${from} invited you to Copacker`

export default function Invitation(props: InvitationProps) {
  const { appUrl, kind, to, token } = props
  return (
    <Layout
      action={{ label: "Accept invitation", href: `${appUrl}/invite?token=${token}&kind=${kind}` }}
      appUrl={appUrl}
      heading={title(props)}
      note={`It’s for ${to} and expires in 7 days.`}
      preview={joining[kind]}
    >
      <Paragraph>{joining[kind]}</Paragraph>
    </Layout>
  )
}

Invitation.PreviewProps = {
  appUrl: "http://localhost:3000",
  kind: "supplier",
  from: "Fencing Club",
  to: "sales@unic.example",
  token: "preview"
} satisfies InvitationProps

export function invitationEmail(props: InvitationProps) {
  return renderEmail(title(props), <Invitation {...props} />)
}
