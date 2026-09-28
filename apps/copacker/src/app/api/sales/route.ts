import { requirePage, session } from "@/server/auth"
import { salesSyncStatus } from "@/server/sales-orders"
import { storeTimeZone } from "@/server/store-time-zone"

// Each connected source's order sync and how much order history is stored.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  requirePage(s, "sales")
  return Response.json({ sources: await salesSyncStatus(s.org.id, await storeTimeZone(s.org)) }, { headers })
}
