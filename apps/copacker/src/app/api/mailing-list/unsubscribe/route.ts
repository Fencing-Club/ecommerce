import { canUnsubscribe, leaveMailingList } from "@/server/mailing-list"
import { appUrl } from "@/server/security"

// Takes an address off the mailing list's emails. The unsubscribe page's button posts its form here, and a mail app's
// own unsubscribe posts to the link in the email's List-Unsubscribe header (RFC 8058), with the address and its
// signature in the query. The signature is the proof either way, so it takes posts from anywhere.
export async function POST(request: Request) {
  const query = new URL(request.url).searchParams
  const form = await request.formData().catch(() => null)
  const field = (name: string) => {
    const value = form?.get(name) ?? query.get(name)
    return typeof value === "string" ? value : ""
  }
  const email = field("email")
  const token = field("token")
  const valid = Boolean(email) && canUnsubscribe(email, token)
  let left = false
  if (valid) {
    left = await leaveMailingList(email).then(
      () => true,
      () => false
    )
  }
  // Someone on the page goes back to it, to see how it went. A mail app only needs to hear whether it worked.
  if (field("from") === "page") {
    const outcome = new URLSearchParams({ email, token, [left ? "done" : "failed"]: "1" })
    return Response.redirect(`${appUrl()}/unsubscribe?${outcome}`, 303)
  }
  if (left) {
    return new Response(null, { status: 200 })
  }
  return new Response(null, { status: valid ? 502 : 400 })
}
