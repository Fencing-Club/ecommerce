import { getAmazonProductMapping, retireAmazonProductMapping } from "@/server/amazon-product-mappings"
import { AnalyticsProblem } from "@/server/analytics-contract"
import { analyticsId, analyticsRoute } from "@/server/analytics-http"
type Context = { params: { id: string } }
export async function GET(request: Request, context: Context) {
  return analyticsRoute(request, false, async (s) => {
    const mapping = await getAmazonProductMapping(s.org.id, analyticsId((await context.params).id))
    if (!mapping) {
      throw new AnalyticsProblem(404, "mapping_not_found", "Mapping not found.")
    }
    return Response.json({ mapping })
  })
}
export async function DELETE(request: Request, context: Context) {
  return analyticsRoute(request, true, async (s) => {
    if (!(await retireAmazonProductMapping(s.org.id, s.user.id, analyticsId((await context.params).id)))) {
      throw new AnalyticsProblem(404, "mapping_not_found", "Mapping not found.")
    }
    return new Response(null, { status: 204 })
  })
}
