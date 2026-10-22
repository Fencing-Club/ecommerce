import { analyticsQuery, analyticsRoute } from "@/server/analytics-http"
import { ingestionQuery, listIngestionEvidence } from "@/server/analytics-ingestion"
export const GET = (request: Request) =>
  analyticsRoute(request, false, async (s) =>
    Response.json(await listIngestionEvidence(s.org.id, analyticsQuery(request, ingestionQuery)))
  )
