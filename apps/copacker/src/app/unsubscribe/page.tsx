import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { Unsubscribe } from "@/components/marketing/unsubscribe"
import { canUnsubscribe } from "@/server/mailing-list"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.unsubscribe")
  // A page for one address's link, so search engines leave it out.
  return { title: t("metaTitle"), robots: { index: false, follow: false } }
}

// Rendered per request: it reads the link's address and signature.
export const dynamic = "force-dynamic"

// What the page says: a link that isn't Copacker's, the answer once the button's post comes back, or else the question.
function stateOf(valid: boolean, done: string, failed: string) {
  if (!valid) {
    return "invalid"
  }
  if (done) {
    return "done"
  }
  return failed ? "failed" : "confirm"
}

// Where an email's unsubscribe link lands: it asks before unsubscribing, since mail scanners open links on their own,
// and says how it went once the button's post comes back.
export default async function UnsubscribePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const read = (name: string) => {
    const value = query[name]
    return typeof value === "string" ? value : ""
  }
  const email = read("email")
  const token = read("token")
  const valid = Boolean(email) && canUnsubscribe(email, token)
  return <Unsubscribe email={email} token={token} state={stateOf(valid, read("done"), read("failed"))} />
}
