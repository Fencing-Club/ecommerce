import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { requestSalesSync, SalesSyncError, salesSources } from "@/server/sales-orders"
import { appUrl } from "@/server/security"

const inputSchema = z.strictObject({ source: z.enum(salesSources) })

// Queues a sync that copies a source's recent orders into Copacker.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers })
  }
  const s = await session()
  requirePage(s, "sales")
  const input = inputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) {
    return Response.json({ error: "Choose Shopify or Amazon" }, { status: 400, headers })
  }
  try {
    return Response.json(await requestSalesSync(s.org, input.data.source), { status: 202, headers })
  } catch (error) {
    if (error instanceof SalesSyncError) {
      return Response.json({ error: error.message }, { status: 409, headers })
    }
    throw error
  }
}
