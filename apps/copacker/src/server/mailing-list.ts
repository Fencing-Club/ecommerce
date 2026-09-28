import { waitlistWelcomeEmail } from "@repo/copacker-emails"
import { translatorFor } from "@/i18n/translator"
import { sendEmail } from "./email"
import { appUrl, hash, sign, verifySignature } from "./security"

// The mailing list the marketing page's waitlist signs people up to: contacts in Resend, added to the segment
// MAILING_LIST_SEGMENT_ID names when it's set, so broadcasts can go to just them. Managing contacts takes a full access
// key, EMAIL_MAILING_LIST_API_KEY, since the key the app sends email with should only be able to send; without one, it
// tries that key. Anyone can sign up, so the page says the same thing whether the address was on the list or not.

const api = "https://api.resend.com"
// What signs an address's unsubscribe links.
const scope = "mailing-list"

function contacts(path: string, init: RequestInit = {}) {
  const key = process.env.EMAIL_MAILING_LIST_API_KEY || process.env.EMAIL_API_KEY
  if (!key) {
    throw new Error("Mailing list is not configured")
  }
  return fetch(`${api}/contacts${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(15000)
  })
}

// Puts the address on the list. `joined` is true when it wasn't on it, or had unsubscribed: the times it gets the
// welcome email. Someone signing up twice gets it once.
export async function joinMailingList(email: string): Promise<{ joined: boolean }> {
  const address = encodeURIComponent(email)
  const segment = process.env.MAILING_LIST_SEGMENT_ID
  const found = await contacts(`/${address}`)
  if (found.ok) {
    const contact: unknown = await found.json().catch(() => null)
    const back = typeof contact === "object" && contact !== null && "unsubscribed" in contact && contact.unsubscribed
    if (back) {
      const resubscribed = await contacts(`/${address}`, {
        method: "PATCH",
        body: JSON.stringify({ unsubscribed: false })
      })
      if (!resubscribed.ok) {
        throw new Error(`Mailing list rejected the signup (${resubscribed.status})`)
      }
    }
    // An address that joined some other way may not be in the segment yet. Being in it already isn't a failure.
    if (segment) {
      await contacts(`/${address}/segments/${encodeURIComponent(segment)}`, { method: "POST" }).catch(() => null)
    }
    return { joined: Boolean(back) }
  }
  if (found.status !== 404) {
    throw new Error(`Mailing list rejected the signup (${found.status})`)
  }
  const created = await contacts("", {
    method: "POST",
    body: JSON.stringify({ email, unsubscribed: false, ...(segment ? { segments: [{ id: segment }] } : {}) })
  })
  if (created.ok) {
    return { joined: true }
  }
  // Another signup for the same address can land between the lookup and this.
  const body: unknown = await created.json().catch(() => null)
  const message = typeof body === "object" && body && "message" in body ? String(body.message) : ""
  if (/already exists/i.test(message)) {
    return { joined: false }
  }
  throw new Error(`Mailing list rejected the signup (${created.status})`)
}

// Takes the address off the list's emails. An address that was never on it is already off.
export async function leaveMailingList(email: string) {
  const response = await contacts(`/${encodeURIComponent(email)}`, {
    method: "PATCH",
    body: JSON.stringify({ unsubscribed: true })
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(`Mailing list couldn't unsubscribe the address (${response.status})`)
  }
}

// The unsubscribe page for the address, and the link a mail app's own unsubscribe posts to. Both carry the address and
// its signature, which is the only proof they need.
export function unsubscribeLinks(email: string) {
  const query = new URLSearchParams({ email, token: sign(email, scope) })
  return { page: `${appUrl()}/unsubscribe?${query}`, oneClick: `${appUrl()}/api/mailing-list/unsubscribe?${query}` }
}

// Whether the token is the address's own unsubscribe signature.
export function canUnsubscribe(email: string, token: string) {
  return verifySignature(email, scope, token)
}

// The welcome email for a new signup, in the language they read the page in. Replies go to Copacker's contact address.
export async function sendWelcome(email: string, locale: string) {
  const t = await translatorFor(locale)
  const links = unsubscribeLinks(email)
  await sendEmail({
    to: email,
    key: `waitlist-welcome:${hash(email)}`,
    ...(process.env.CONTACT_EMAIL ? { replyTo: process.env.CONTACT_EMAIL } : {}),
    headers: { "List-Unsubscribe": `<${links.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    ...(await waitlistWelcomeEmail({
      appUrl: appUrl(),
      unsubscribe: links.page,
      lang: locale,
      copy: {
        subject: t("emails.waitlistWelcome.subject"),
        eyebrow: t("emails.waitlistWelcome.eyebrow"),
        heading: t("emails.waitlistWelcome.heading"),
        lead: t("emails.waitlistWelcome.lead"),
        preview: t("emails.waitlistWelcome.preview"),
        steps: [
          t("emails.waitlistWelcome.step1"),
          t("emails.waitlistWelcome.step2"),
          t("emails.waitlistWelcome.step3")
        ],
        action: t("emails.waitlistWelcome.action"),
        note: t("emails.waitlistWelcome.note"),
        reason: t("emails.waitlistWelcome.reason", { email }),
        unsubscribe: t("emails.waitlistWelcome.unsubscribe"),
        tagline: t("emails.tagline")
      }
    }))
  })
}
