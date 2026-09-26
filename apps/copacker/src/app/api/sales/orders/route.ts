import { z } from "zod"
import { session } from "@/server/auth"
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
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  const params = new URL(request.url).searchParams
  const input = inputSchema.safeParse({
    source: params.get("source") || undefined,
    page: params.get("page") ?? undefined,
    q: params.get("q") || undefined
  })
  if (!input.success) {
    return Response.json({ error: "Check the filters and try again" }, { status: 400, headers })
  }
  return Response.json(await listSalesOrders(s.org.id, input.data), { headers })
}
