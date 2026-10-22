import { landedChargeInput } from "@/lib/landed-allocation"
import { analyticsId, analyticsJson, analyticsQuery, analyticsRoute } from "@/server/analytics-http"
import { landedChargeQuery, listLandedCharges, saveLandedCharge } from "@/server/inventory-landed-costs"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) =>
    Response.json(await listLandedCharges(s.org.id, analyticsQuery(request, landedChargeQuery)))
  )
}
export async function POST(request: Request) {
  return analyticsRoute(request, true, async (s) => {
    const result = await saveLandedCharge(
      s.org.id,
      s.user.id,
      analyticsId(request.headers.get("Idempotency-Key")),
      await analyticsJson(request, landedChargeInput)
    )
    return Response.json(
      { charge: result.charge },
      {
        status: result.replayed ? 200 : 201,
        headers: { Location: `/api/analytics/landed-charges/${result.charge.id}` }
      }
    )
  })
}
