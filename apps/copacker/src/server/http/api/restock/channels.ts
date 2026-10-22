import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { restockChannels } from "@/server/restock-page"

// Where the buyer can restock: Amazon and each Shopify location counted in inventory.
export async function GET() {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "restock")
  return Response.json(await restockChannels(s.org.id))
}
