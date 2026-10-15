import { session } from "@/server/auth"
import { withRequest } from "@/server/next-request"

// The workspace this browser is signed in to now, which another tab may have switched.
export const GET = withRequest(async function GET() {
  const s = await session()
  return Response.json({ id: s.org.id }, { headers: { "Cache-Control": "no-store" } })
})
