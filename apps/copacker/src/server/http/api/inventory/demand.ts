import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { errorResponse, failureMessage } from "@/server/errors"
import { fallbackResponse } from "@/server/http-response"
import { demandInputSchema, DemandAccessError, readSalesDemand } from "@/server/sales"

export async function POST(request: Request) {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "sales")
  const input = demandInputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) {
    return errorResponse("chooseSalesRange", 400)
  }
  try {
    const result = await readSalesDemand(s, input.data, async () => {
      request.signal.throwIfAborted()
    })
    return Response.json(result)
  } catch (error) {
    if (error instanceof DemandAccessError) {
      return Response.json({ error: await failureMessage(error) }, { status: 409 })
    }
    return fallbackResponse(error, "salesRefreshFailed", 503)
  }
}
