import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { errorResponse } from "@/server/errors"
import { refreshStock, stockSelection } from "@/server/stock"

export async function POST(request: Request) {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "products")
  const parsed = stockSelection.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return errorResponse("chooseStockSource", 400)
  }
  const result = await refreshStock(s.org, parsed.data)
  if (!result) {
    return errorResponse("connectBeforeStockRefresh", 409)
  }
  return Response.json(result, { status: 202 })
}
