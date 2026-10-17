import { z } from "zod"
import { analyticsHeaders, analyticsJson, analyticsRoute } from "@/server/analytics-http"
import { landedChargeQuery, listLandedCharges, saveLandedCharge } from "@/server/inventory-landed-costs"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) =>
    Response.json(
      await listLandedCharges(s.org.id, landedChargeQuery.parse(Object.fromEntries(new URL(request.url).searchParams))),
      { headers: analyticsHeaders }
    )
  )
}
export async function POST(request: Request) {
  return analyticsRoute(request, true, async (s) => {
    const result = await saveLandedCharge(
      s.org.id,
      s.user.id,
      z.uuid().parse(request.headers.get("Idempotency-Key")),
      await analyticsJson(request)
    )
    return Response.json(
      { charge: result.charge },
      {
        status: result.replayed ? 200 : 201,
        headers: { ...analyticsHeaders, Location: `/api/analytics/landed-charges/${result.charge.id}` }
      }
    )
  })
}
