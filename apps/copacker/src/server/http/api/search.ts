import { session } from "@/server/auth"
import { searchIndex } from "@/server/search"

// What the app header's search looks through.
export async function GET() {
  const s = await session()
  return Response.json(await searchIndex(s))
}
