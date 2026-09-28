import { requirePage, session } from "@/server/auth"
import { refreshStock, stockSelection } from "@/server/stock"

export async function POST(request: Request) {
  const s = await session()
  const headers = { "Cache-Control": "private, no-store" }
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  requirePage(s, "products")
  const parsed = stockSelection.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "Choose Shopify, AWD US, or FBA with the US marketplace" }, { status: 400, headers })
  }
  const result = await refreshStock(s.org, parsed.data)
  if (!result) {
    return Response.json({ error: "Connect the selected account before refreshing stock" }, { status: 409, headers })
  }
  return Response.json(result, { status: 202, headers })
}
