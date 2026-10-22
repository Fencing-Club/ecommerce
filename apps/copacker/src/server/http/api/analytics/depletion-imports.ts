import { analyticsQuery, analyticsRoute } from "@/server/analytics-http"
import { listImportResults, importResultQuery } from "@/server/inventory-auto-import"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) =>
    Response.json(await listImportResults(s.org.id, analyticsQuery(request, importResultQuery)))
  )
}
