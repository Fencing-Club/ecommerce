import { unitMappingInput } from "@/lib/inventory-unit-mapping"
import { analyticsRoute, analyticsId, analyticsJson, analyticsQuery } from "@/server/analytics-http"
import { saveUnitMapping, listUnitMappings, unitMappingQuery } from "@/server/inventory-unit-mappings"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) =>
    Response.json(await listUnitMappings(s.org.id, analyticsQuery(request, unitMappingQuery)))
  )
}
export async function POST(request: Request) {
  return analyticsRoute(request, true, async (s) => {
    const result = await saveUnitMapping(
      s.org.id,
      s.user.id,
      analyticsId(request.headers.get("Idempotency-Key")),
      await analyticsJson(request, unitMappingInput)
    )
    return Response.json(
      { mapping: result.mapping },
      {
        status: result.replayed ? 200 : 201,
        headers: { Location: `/api/analytics/unit-mappings/${result.mapping.id}` }
      }
    )
  })
}
