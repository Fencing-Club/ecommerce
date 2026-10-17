import { z } from "zod"
import { analyticsRoute, analyticsHeaders, analyticsJson } from "@/server/analytics-http"
import { saveUnitMapping, listUnitMappings, unitMappingQuery } from "@/server/inventory-unit-mappings"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) =>
    Response.json(
      await listUnitMappings(s.org.id, unitMappingQuery.parse(Object.fromEntries(new URL(request.url).searchParams))),
      { headers: analyticsHeaders }
    )
  )
}
export async function POST(request: Request) {
  return analyticsRoute(request, true, async (s) => {
    const result = await saveUnitMapping(
      s.org.id,
      s.user.id,
      z.uuid().parse(request.headers.get("Idempotency-Key")),
      await analyticsJson(request)
    )
    return Response.json(
      { mapping: result.mapping },
      {
        status: result.replayed ? 200 : 201,
        headers: { ...analyticsHeaders, Location: `/api/analytics/unit-mappings/${result.mapping.id}` }
      }
    )
  })
}
