import { ebayNotificationSchema, ebaySigned, forwardEbayNotification } from "@/server/ebay-events"
import { ebayChallengeResponse, ebayVerificationToken } from "@/server/ebay-notifications"

// eBay confirms the endpoint is ours before it sends anything to it.
export function GET(request: Request) {
  const challengeCode = new URL(request.url).searchParams.get("challenge_code")
  const verificationToken = ebayVerificationToken()
  if (!verificationToken) {
    return Response.json({ error: "eBay notifications are not configured" }, { status: 503 })
  }
  if (!challengeCode) {
    return Response.json({ error: "challenge_code is required" }, { status: 400 })
  }
  return Response.json({ challengeResponse: ebayChallengeResponse(challengeCode, verificationToken) })
}

// eBay's notifications: account deletion notices and the order topics sellers are subscribed to. Each is checked
// against eBay's signature, then sent on to its work (see forwardEbayNotification). A notice eBay doesn't get
// acknowledged is sent again.
export async function POST(request: Request) {
  const body = await request.text()
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    json = null
  }
  const parsed = ebayNotificationSchema.safeParse(json)
  if (!parsed.success) {
    return Response.json({ error: "Not an eBay notification" }, { status: 400 })
  }
  const { topic } = parsed.data.metadata
  const signed = await ebaySigned(body, request.headers.get("x-ebay-signature"))
  const logged = { event: "ebay_notification", topic, notificationId: parsed.data.notification.notificationId }
  if (signed === false) {
    console.warn(JSON.stringify({ ...logged, outcome: "bad signature" }))
    return Response.json({ error: "Signature doesn't match" }, { status: 412 })
  }
  if (signed === null) {
    // A deletion notice is acknowledged even when it can't be checked yet: Copacker keeps no buyer's data, and eBay
    // needs the endpoint to answer. Anything else waits for eBay to send it again.
    // oxlint-disable-next-line no-console
    console.log(JSON.stringify({ ...logged, outcome: "unchecked" }))
    return topic === "MARKETPLACE_ACCOUNT_DELETION"
      ? new Response(null, { status: 204 })
      : Response.json({ error: "Signature couldn't be checked" }, { status: 503 })
  }
  const outcome = await forwardEbayNotification(parsed.data)
  // oxlint-disable-next-line no-console
  console.log(JSON.stringify({ ...logged, outcome }))
  return new Response(null, { status: 204 })
}
