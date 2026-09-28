import { ZodError } from "zod"
import { can } from "@/lib/access"
import { requirePage, session } from "@/server/auth"
import { RestockInputError, restockReport } from "@/server/restock-page"
import type { RestockLine } from "@/server/restock-plan"
import { appUrl } from "@/server/security"

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
  const headers = { "Cache-Control": "private, no-store" }
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers })
  }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  requirePage(s, "restock")
  try {
    const report = await restockReport(s, await request.json())
    return Response.json(can(s, "prices") ? report : { ...report, lines: report.lines.map(withoutPrices) }, { headers })
  } catch (error) {
    if (error instanceof RestockInputError) {
      return Response.json({ error: error.message }, { status: 409, headers })
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json(
        { error: "Enter a sales period and lead time of 1 to 730 days, and choose where to restock" },
        { status: 400, headers }
      )
    }
    throw error
  }
}
