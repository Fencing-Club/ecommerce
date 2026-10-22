import { amazonReconciliation, reconciliationInput } from "@/server/amazon-reconciliation-data"
import { analyticsQuery, analyticsRoute } from "@/server/analytics-http"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) =>
    Response.json(await amazonReconciliation(s.org.id, analyticsQuery(request, reconciliationInput)))
  )
}
