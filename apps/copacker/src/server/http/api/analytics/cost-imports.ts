import { z } from "zod"
import { importAnalyticsCosts } from "@/server/analytics-cost-imports"
import { analyticsHeaders, analyticsJson, analyticsRoute } from "@/server/analytics-http"
export const POST = (request: Request) =>
  analyticsRoute(request, true, async (s) => {
    const key = z.uuid().parse(request.headers.get("Idempotency-Key"))
    const result = await importAnalyticsCosts(s.org.id, s.user.id, key, await analyticsJson(request))
    return Response.json(
      { record: result.record },
      {
        status: result.replayed ? 200 : 201,
        headers: { ...analyticsHeaders, Location: `/api/analytics/cost-imports/${key}` }
      }
    )
  })
