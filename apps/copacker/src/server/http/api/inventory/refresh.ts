import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { isAppOrigin } from "@/server/security"
import { refreshStock, stockSelection } from "@/server/stock"

export async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  const s = await session()
  const headers = { "Cache-Control": "private, no-store" }
  if (s.org.kind !== "buyer") {
    return errorResponse("buyerWorkspaceRequired", 403, headers)
  }
  requirePage(s, "products")
  const parsed = stockSelection.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return errorResponse("chooseStockSource", 400, headers)
  }
  const result = await refreshStock(s.org, parsed.data)
  if (!result) {
    return errorResponse("connectBeforeStockRefresh", 409, headers)
  }
  return Response.json(result, { status: 202, headers })
}
