import { z } from "zod"
import { can } from "@/lib/access"
import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { listSalesOrders, salesSources } from "@/server/sales-orders"

const inputSchema = z.object({
  source: z.enum(salesSources).optional(),
  page: z.coerce.number().int().min(0).max(10000).default(0),
  q: z.string().max(100).optional()
})

// Stored sales orders, newest first.
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return errorResponse("buyerWorkspaceRequired", 403, headers)
  }
  requirePage(s, "sales")
  const params = new URL(request.url).searchParams
  const input = inputSchema.safeParse({
    source: params.get("source") || undefined,
    page: params.get("page") ?? undefined,
    q: params.get("q") || undefined
  })
  if (!input.success) {
    return errorResponse("checkFilters", 400, headers)
  }
  const prices = can(s, "prices")
  const list = await listSalesOrders(s.org.id, input.data, { prices })
  // A member who doesn't see prices gets each order without its sales and fees.
  return Response.json(
    prices ? list : { ...list, orders: list.orders.map((order) => ({ ...order, sales: null, fees: null })) },
    { headers }
  )
}
