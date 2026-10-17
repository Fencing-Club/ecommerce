import { analyticsHeaders, analyticsRoute } from "@/server/analytics-http"
import { costQuery, listOperatingCosts } from "@/server/analytics-ingestion"
export const GET = (request: Request) =>
  analyticsRoute(request, false, async (s) => {
    const input = costQuery.parse(Object.fromEntries(new URL(request.url).searchParams))
    return Response.json(await listOperatingCosts(s.org.id, input), { headers: analyticsHeaders })
  })
