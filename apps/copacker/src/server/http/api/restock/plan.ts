import { can } from "@/lib/access"
import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { errorResponse, failureMessage, InvalidRequestError, requestJson } from "@/server/errors"
import { RestockInputError, restockReport } from "@/server/restock-page"
import { restockWithoutPrices } from "@/server/restock-plan"

// Restock suggestions for Amazon or one Shopify location, from stored orders.
export async function POST(request: Request) {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "restock")
  try {
    const report = await restockReport(s, await requestJson(request))
    return Response.json(can(s, "prices") ? report : { ...report, lines: report.lines.map(restockWithoutPrices) })
  } catch (error) {
    if (error instanceof RestockInputError) {
      return Response.json({ error: await failureMessage(error) }, { status: 409 })
    }
    if (error instanceof InvalidRequestError) {
      return errorResponse("enterRestockPeriod", 400)
    }
    throw error
  }
}
