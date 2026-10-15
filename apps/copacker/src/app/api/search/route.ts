import { session } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { searchIndex } from "@/server/search"

// What the app header's search looks through.
export const GET = withRequest(async function GET() {
  const s = await session()
  return Response.json(await searchIndex(s), { headers: { "Cache-Control": "private, no-store" } })
})
