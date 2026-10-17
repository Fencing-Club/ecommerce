import { session } from "@/server/auth"

// The workspace this browser is signed in to now, which another tab may have switched.
export async function GET() {
  const s = await session()
  return Response.json({ id: s.org.id }, { headers: { "Cache-Control": "no-store" } })
}
