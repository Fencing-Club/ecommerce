import { contactSchema } from "@/lib/contact"
import { sendContactMessage } from "@/server/contact"
import { errorResponse } from "@/server/errors"
import { withRequest } from "@/server/next-request"
import { clientAddress, rateLimit } from "@/server/rate-limit"

// A few messages from one address in a short while is plenty.
const limited = rateLimit({ period: 10 * 60 * 1000, allowed: 5 })

// The contact page's messages. Anyone can send one, signed in or not.
export const POST = withRequest(async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  // A field people never see. Bots that fill it in are told their message went, and it doesn't.
  if (typeof body === "object" && body && "website" in body && body.website) {
    return Response.json({ ok: true })
  }
  const parsed = contactSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse("checkForm", 400)
  }
  if (limited(clientAddress(request))) {
    return errorResponse("tooManyMessages", 429)
  }
  try {
    await sendContactMessage(parsed.data)
  } catch {
    return errorResponse("messageNotSent", 502)
  }
  return Response.json({ ok: true })
})
