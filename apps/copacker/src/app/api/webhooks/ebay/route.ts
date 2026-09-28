import { ebayChallengeResponse, ebayNotificationSchema, ebayVerificationToken } from "@/server/ebay-notifications"

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

// Account deletion notices. Copacker stores nothing from eBay yet, so there is nothing to erase: each notice is
// acknowledged, and a notice eBay doesn't get acknowledged is sent again.
export async function POST(request: Request) {
  const parsed = ebayNotificationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "Not an eBay notification" }, { status: 400 })
  }
  // oxlint-disable-next-line no-console
  console.log(
    JSON.stringify({
      event: "ebay_notification",
      topic: parsed.data.metadata.topic,
      notificationId: parsed.data.notification.notificationId
    })
  )
  return new Response(null, { status: 204 })
}
