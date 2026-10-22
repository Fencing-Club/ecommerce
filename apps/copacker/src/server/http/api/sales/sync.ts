import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import { requestSalesSync, SalesSyncError, salesSources } from "@/server/sales-orders"

const inputSchema = z.strictObject({ source: z.enum(salesSources) })

// Queues a sync that copies a source's recent orders into Copacker.
export async function POST(request: Request) {
  const s = await session()
  requirePage(s, "sales")
  const input = inputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) {
    return errorResponse("chooseShopifyOrAmazon", 400)
  }
  try {
    return Response.json(await requestSalesSync(s.org, input.data.source), { status: 202 })
  } catch (error) {
    if (error instanceof SalesSyncError) {
      return Response.json({ error: await failureMessage(error) }, { status: 409 })
    }
    throw error
  }
}
