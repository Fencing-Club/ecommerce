import { z } from "zod"
import { can } from "@/lib/access"
import { stores } from "@/lib/stores"
import { errorResponse } from "./errors"
import { listSalesOrders } from "./sales-orders"
import type { Session } from "./workspace-session"

const filters = z.object({
  source: z.enum(stores).optional(),
  page: z.coerce.number().int().min(0).max(10000).default(0),
  q: z.string().max(100).optional()
})

export async function salesOrderList(session: Session, params: URLSearchParams) {
  const headers = { "Cache-Control": "private, no-store" }
  if (session.org.kind !== "buyer") {
    return errorResponse("buyerWorkspaceRequired", 403, headers)
  }
  if (!can(session, "sales")) {
    return errorResponse("forbidden", 403, headers)
  }
  const input = filters.safeParse({
    source: params.get("source") || undefined,
    page: params.get("page") ?? undefined,
    q: params.get("q") || undefined
  })
  if (!input.success) {
    return errorResponse("checkFilters", 400, headers)
  }
  const prices = can(session, "prices")
  const list = await listSalesOrders(session.org.id, input.data, { prices })
  return Response.json(
    prices ? list : { ...list, orders: list.orders.map((order) => ({ ...order, sales: null, fees: null })) },
    { headers }
  )
}
