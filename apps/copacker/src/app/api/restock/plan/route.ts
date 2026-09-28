import { ZodError } from "zod"
import { requirePage, session } from "@/server/auth"
import { RestockInputError, restockReport } from "@/server/restock-page"
import { appUrl } from "@/server/security"

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
    return Response.json(await restockReport(s, await request.json()), { headers })
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
