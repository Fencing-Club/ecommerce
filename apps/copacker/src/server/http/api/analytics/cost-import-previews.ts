import { costImportBatch, previewAnalyticsCosts } from "@/server/analytics-cost-imports"
import { analyticsJson, analyticsRoute } from "@/server/analytics-http"
export const POST = (request: Request) =>
  analyticsRoute(request, true, async (s) => {
    const preview = await previewAnalyticsCosts(s.org.id, s.user.id, await analyticsJson(request, costImportBatch))
    return Response.json({ preview })
  })
