import { requirePage, session } from "@/server/auth"
import { restockChannels } from "@/server/restock-page"

// Where the buyer can restock: Amazon and each Shopify location counted in inventory.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  requirePage(s, "restock")
  return Response.json(await restockChannels(s.org.id), { headers })
}
