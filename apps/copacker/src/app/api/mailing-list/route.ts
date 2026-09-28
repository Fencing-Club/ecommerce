import { z } from "zod"
import { joinMailingList } from "@/server/mailing-list"
import { clientAddress, rateLimit } from "@/server/rate-limit"

const signup = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  // A field people never see. Bots that fill in every field get told they're on the list, and aren't.
  website: z.string().max(0).optional()
})

// A few signups per address in a short while is plenty; more is someone filling the list with other people's email.
const limited = rateLimit({ period: 10 * 60 * 1000, allowed: 5 })

// The marketing page's signup for product news. Anyone signed out can use it.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  if (typeof body === "object" && body && "website" in body && body.website) {
    return Response.json({ ok: true })
  }
  const parsed = signup.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 })
  }
  if (limited(clientAddress(request))) {
    return Response.json({ error: "Too many signups. Try again in a few minutes." }, { status: 429 })
  }
  try {
    await joinMailingList(parsed.data.email)
  } catch {
    return Response.json({ error: "Couldn’t sign you up. Try again in a moment." }, { status: 502 })
  }
  return Response.json({ ok: true })
}
