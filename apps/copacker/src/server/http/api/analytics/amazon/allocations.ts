import { amazonAllocations, allocationInput } from "@/server/amazon-allocation-data"
import { analyticsQuery, analyticsRoute } from "@/server/analytics-http"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) =>
    Response.json(await amazonAllocations(s.org.id, analyticsQuery(request, allocationInput)))
  )
}
