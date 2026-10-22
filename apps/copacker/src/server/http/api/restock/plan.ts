import { can } from "@/lib/access"
import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { errorResponse, failureMessage, InvalidRequestError, requestJson } from "@/server/errors"
import { RestockInputError, restockReport } from "@/server/restock-page"
import type { RestockLine } from "@/server/restock-plan"

// A line without what it costs and sells for, or the sales and profit it would lose, for a member who doesn't see
// prices. The quantities stay.
function withoutPrices(line: RestockLine): RestockLine {
  return {
    ...line,
    unitCostMinor: null,
    costCurrency: null,
    estimatedCostMinor: null,
    priceMinor: null,
    priceCurrency: null,
    lostSalesMinor: null,
    lostProfitMinor: null
  }
}

// Restock suggestions for Amazon or one Shopify location, from stored orders.
export async function POST(request: Request) {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "restock")
  try {
    const report = await restockReport(s, await requestJson(request))
    return Response.json(can(s, "prices") ? report : { ...report, lines: report.lines.map(withoutPrices) })
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
