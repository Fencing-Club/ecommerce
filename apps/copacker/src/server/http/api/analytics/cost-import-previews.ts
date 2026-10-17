import { previewAnalyticsCosts } from "@/server/analytics-cost-imports"
import { analyticsHeaders, analyticsJson, analyticsRoute } from "@/server/analytics-http"
export const POST = (request: Request) =>
  analyticsRoute(request, true, async (s) => {
    const preview = await previewAnalyticsCosts(s.org.id, s.user.id, await analyticsJson(request))
    return Response.json({ preview }, { headers: analyticsHeaders })
  })
