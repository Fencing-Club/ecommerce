import { analyticsHeaders, analyticsRoute } from "@/server/analytics-http"
import { ingestionStatus } from "@/server/analytics-ingestion"
export const GET = (request: Request) =>
  analyticsRoute(request, false, async (s) => {
    return Response.json(await ingestionStatus(s.org.id), { headers: analyticsHeaders })
  })
