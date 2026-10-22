import { costImportBatch, importAnalyticsCosts } from "@/server/analytics-cost-imports"
import { analyticsId, analyticsJson, analyticsRoute } from "@/server/analytics-http"
export const POST = (request: Request) =>
  analyticsRoute(request, true, async (s) => {
    const key = analyticsId(request.headers.get("Idempotency-Key"))
    const result = await importAnalyticsCosts(s.org.id, s.user.id, key, await analyticsJson(request, costImportBatch))
    return Response.json(
      { record: result.record },
      { status: result.replayed ? 200 : 201, headers: { Location: `/api/analytics/cost-imports/${key}` } }
    )
  })
