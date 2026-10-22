import { analyticsQuery, analyticsRoute } from "@/server/analytics-http"
import { costQuery, listOperatingCosts } from "@/server/analytics-ingestion"
export const GET = (request: Request) =>
  analyticsRoute(request, false, async (s) =>
    Response.json(await listOperatingCosts(s.org.id, analyticsQuery(request, costQuery)))
  )
