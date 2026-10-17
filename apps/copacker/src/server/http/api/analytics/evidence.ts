import { analyticsHeaders, analyticsRoute } from "@/server/analytics-http"
import { ingestionQuery, listIngestionEvidence } from "@/server/analytics-ingestion"
export const GET = (request: Request) =>
  analyticsRoute(request, false, async (s) => {
    const input = ingestionQuery.parse(Object.fromEntries(new URL(request.url).searchParams))
    return Response.json(await listIngestionEvidence(s.org.id, input), { headers: analyticsHeaders })
  })
