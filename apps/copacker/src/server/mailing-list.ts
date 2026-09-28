import { waitlistWelcomeEmail } from "@repo/copacker-emails"
import { UnprocessableEntityException } from "@workos-inc/node"
import { type Locale, localeNames } from "@/i18n/locales"
import { translatorFor } from "@/i18n/translator"
import { sendEmail } from "./email"
import { appUrl, hash, sign, verifySignature } from "./security"
import { workos } from "./workos"

// The waitlist the marketing page signs people up to: entries on the WorkOS environment's default waitlist, which
// the Waitlist feature (Authentication, Features) must have created. Approving an entry in the dashboard (Users,
// Waitlist) sends WorkOS's invitation, whose link opens /signup. Anyone can sign up, so the page says the same thing
// whether the address was on the list or not.

// What signs an address's unsubscribe links.
const scope = "mailing-list"
// How recently an entry must have been created to count as new: WorkOS returns an address's existing entry unchanged.
const fresh = 60 * 1000

// Puts the address on the waitlist, with the language they signed up in and the site they used, since local, staging
// and production share one WorkOS environment. `joined` is true when the entry is new, the one time it gets the
// welcome email; leaving deletes the entry, so coming back is new again. `id` is the entry's.
export async function joinWaitlist(email: string, locale: string): Promise<{ joined: boolean; id?: string }> {
  try {
    const entry = await workos().userManagement.createWaitlistEntry("default", {
      email,
      additionalFields: { locale, site: appUrl() }
    })
    const joined = entry.state === "pending" && Date.now() - Date.parse(entry.createdAt) < fresh
    return { joined, id: entry.id }
  } catch (error) {
    // WorkOS refuses an address that already has an account. It's told the same as anyone else.
    if (error instanceof UnprocessableEntityException) {
      return { joined: false }
    }
    throw error
  }
}

// Takes the address off the waitlist. An address that was never on it is already off. WorkOS finds entries only by
// listing them, which is fine at a waitlist's size.
export async function leaveWaitlist(email: string) {
  const entries = await workos().userManagement.listWaitlistEntries("default", { limit: 100 })
  for (const entry of await entries.autoPagination()) {
    if (entry.email.toLowerCase() === email.toLowerCase()) {
      await workos().userManagement.deleteWaitlistEntry(entry.id)
    }
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

// Tells Copacker's contact address that someone joined, in which language, and where to let them in. Replying goes
// straight to them. Without CONTACT_EMAIL, nobody is told.
export async function sendSignupNotice(email: string, locale: Locale) {
  const to = process.env.CONTACT_EMAIL
  if (!to) {
    return
  }
  await sendEmail({
    to,
    replyTo: email,
    subject: `Waitlist signup: ${email}`,
    text: [
      `${email} joined the waitlist.`,
      `Language: ${localeNames[locale]}`,
      "Approve them in WorkOS, under Users, Waitlist."
    ].join("\n"),
    key: `waitlist-signup:${hash(email)}`
  })
}
