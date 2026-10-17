import { amazonReconciliation, reconciliationInput } from "@/server/amazon-reconciliation-data"
import { analyticsHeaders, analyticsRoute } from "@/server/analytics-http"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) => {
    const params = new URL(request.url).searchParams
    const input = reconciliationInput.parse(Object.fromEntries(params))
    return Response.json(await amazonReconciliation(s.org.id, input), { headers: analyticsHeaders })
  })
}
