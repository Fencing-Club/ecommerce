import { analyticsRoute, analyticsHeaders } from "@/server/analytics-http"
import { listImportResults, importResultQuery } from "@/server/inventory-auto-import"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) =>
    Response.json(
      await listImportResults(s.org.id, importResultQuery.parse(Object.fromEntries(new URL(request.url).searchParams))),
      { headers: analyticsHeaders }
    )
  )
}
