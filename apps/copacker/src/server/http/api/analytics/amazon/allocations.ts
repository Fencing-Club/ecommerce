import { amazonAllocations, allocationInput } from "@/server/amazon-allocation-data"
import { analyticsHeaders, analyticsRoute } from "@/server/analytics-http"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) => {
    const params = new URL(request.url).searchParams
    const input = allocationInput.parse(Object.fromEntries(params))
    return Response.json(await amazonAllocations(s.org.id, input), { headers: analyticsHeaders })
  })
}
