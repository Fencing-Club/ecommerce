import { requirePage, session } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import { demandInputSchema, DemandAccessError, readSalesDemand } from "@/server/sales"
import { isAppOrigin } from "@/server/security"

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403, headers)
  }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return errorResponse("buyerWorkspaceRequired", 403, headers)
  }
  requirePage(s, "sales")
  const input = demandInputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) {
    return errorResponse("chooseSalesRange", 400, headers)
  }
  try {
    const result = await readSalesDemand(s, input.data, async () => {
      request.signal.throwIfAborted()
    })
    return Response.json(result, { headers })
  } catch (error) {
    if (error instanceof DemandAccessError) {
      return Response.json({ error: await failureMessage(error) }, { status: 409, headers })
    }
    return errorResponse("salesRefreshFailed", 503, headers)
  }
}
