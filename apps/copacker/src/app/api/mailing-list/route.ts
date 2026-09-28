import { z } from "zod"
import { negotiateLocale } from "@/i18n/locales"
import { errorResponse } from "@/server/errors"
import { joinMailingList, sendSignupNotice, sendWelcome } from "@/server/mailing-list"
import { clientAddress, rateLimit } from "@/server/rate-limit"

const signup = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  // A field people never see. Bots that fill in every field get told they're on the list, and aren't.
  website: z.string().max(0).optional()
})

// A few signups per address in a short while is plenty; more is someone filling the list with other people's email.
const limited = rateLimit({ period: 10 * 60 * 1000, allowed: 5 })

// The marketing page's waitlist signup. Anyone signed out can use it. The list keeps the language the page was shown
// in. Someone new to it gets a welcome email in that language, and CONTACT_EMAIL hears they joined; if either email
// fails, they're still on the list.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  if (typeof body === "object" && body && "website" in body && body.website) {
    return Response.json({ ok: true })
  }
  const parsed = signup.safeParse(body)
  if (!parsed.success) {
    return errorResponse("enterValidEmail", 400)
  }
  if (limited(clientAddress(request))) {
    return errorResponse("tooManySignups", 429)
  }
  const locale = negotiateLocale(request.headers.get("accept-language"))
  let joined = false
  try {
    ;({ joined } = await joinMailingList(parsed.data.email, locale))
  } catch {
    return errorResponse("signupFailed", 502)
  }
  if (joined) {
    const logFailure = (event: string) => (error: unknown) => {
      console.error(JSON.stringify({ event, error: String(error) }))
    }
    await Promise.all([
      sendWelcome(parsed.data.email, locale).catch(logFailure("waitlist_welcome_failed")),
      sendSignupNotice(parsed.data.email, locale).catch(logFailure("waitlist_signup_notice_failed"))
    ])
  }
  return Response.json({ ok: true })
}
