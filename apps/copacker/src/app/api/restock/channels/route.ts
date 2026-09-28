import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { restockChannels } from "@/server/restock-page"

// Where the buyer can restock: Amazon and each Shopify location counted in inventory.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return errorResponse("buyerWorkspaceRequired", 403, headers)
  }
  requirePage(s, "restock")
  return Response.json(await restockChannels(s.org.id), { headers })
}
