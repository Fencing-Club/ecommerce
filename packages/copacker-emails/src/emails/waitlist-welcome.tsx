/** @jsxRuntime automatic */
import { type EmailCopy, Layout } from "../layout"
import { Steps } from "../parts"
import { renderEmail } from "../render"

export type WaitlistWelcomeProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  // The page where the reader stops these emails, signed for their address.
  unsubscribe: string
  // The language the copy is written in, such as "de".
  lang: string
  // The words, already in the reader's language.
  copy: EmailCopy & {
    action: string
    // What happens once their spot opens.
    steps: ReadonlyArray<string>
    unsubscribe: string
  }
}

// Sent once, when someone joins the waitlist on the landing page: they're on it, what happens when their spot opens,
// and a look at how Copacker works while they wait.
export default function WaitlistWelcome({ appUrl, copy, lang, unsubscribe }: WaitlistWelcomeProps) {
  return (
    <Layout
      action={{ label: copy.action, href: `${appUrl}/#handoffs` }}
      appUrl={appUrl}
      copy={copy}
      lang={lang}
      unsubscribe={{ label: copy.unsubscribe, href: unsubscribe }}
    >
      <Steps steps={copy.steps} />
    </Layout>
  )
}

WaitlistWelcome.PreviewProps = {
  appUrl: "http://localhost:3000",
  unsubscribe: "http://localhost:3000/unsubscribe?email=ana%40example.com&token=preview",
  lang: "en",
  copy: {
    subject: "You’re on the Copacker waitlist",
    eyebrow: "Early access",
    heading: "You’re on the list",
    lead: "We’re letting teams in a few at a time, and we’ll write to you when your spot opens.",
    preview: "We’ll write to you when your spot opens.",
    steps: [
      "When your spot opens, we’ll email you a link to set up your workspace.",
      "Connect Amazon, Shopify and eBay, and Copacker forecasts every product’s stock.",
      "Reorder in one click, and follow each purchase order to FBA, AWD or your own warehouse."
    ],
    action: "See how it works",
    note: "Questions before then? Reply to this email.",
    reason: "You joined the Copacker waitlist as ana@example.com.",
    unsubscribe: "Unsubscribe",
    tagline: "Restocking, handled."
  }
} satisfies WaitlistWelcomeProps

export function waitlistWelcomeEmail(props: WaitlistWelcomeProps) {
  return renderEmail(props.copy.subject, <WaitlistWelcome {...props} />)
}
