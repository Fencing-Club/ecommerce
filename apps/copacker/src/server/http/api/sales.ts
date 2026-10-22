import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { salesSyncStatus } from "@/server/sales-orders"
import { storeTimeZone } from "@/server/store-time-zone"

// Each connected source's order sync and how much order history is stored.
export async function GET() {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "sales")
  return Response.json({ sources: await salesSyncStatus(s.org.id, await storeTimeZone(s.org)) })
}
