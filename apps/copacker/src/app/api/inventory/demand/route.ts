import { session } from "@/server/auth"
import { demandInputSchema, DemandAccessError, readSalesDemand } from "@/server/sales"
import { appUrl } from "@/server/security"

export const maxDuration = 300
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers })
  }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  const input = demandInputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) {
    return Response.json({ error: "Choose a sales source and a valid date range" }, { status: 400, headers })
  }
  try {
    const result = await readSalesDemand(s, input.data, async () => {
      request.signal.throwIfAborted()
    })
    return Response.json(result, { headers })
  } catch (error) {
    if (error instanceof DemandAccessError) {
      return Response.json({ error: error.message }, { status: 409, headers })
    }
    return Response.json(
      {
        error:
          "Sales refresh failed. No partial sales result was returned. Check the connection and try a shorter window."
      },
      { status: 503, headers }
    )
  }
}
