import { analyticsRoute } from "@/server/analytics-http"
import { ingestionStatus } from "@/server/analytics-ingestion"
export const GET = (request: Request) =>
  analyticsRoute(request, false, async (s) => Response.json(await ingestionStatus(s.org.id)))
