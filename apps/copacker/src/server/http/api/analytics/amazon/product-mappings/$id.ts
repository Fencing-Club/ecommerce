import { z } from "zod"
import { getAmazonProductMapping, retireAmazonProductMapping } from "@/server/amazon-product-mappings"
import { AnalyticsProblem } from "@/server/analytics-contract"
import { analyticsHeaders, analyticsRoute } from "@/server/analytics-http"
type Context = { params: { id: string } }
export async function GET(request: Request, context: Context) {
  return analyticsRoute(request, false, async (s) => {
    const id = z.uuid().parse((await context.params).id)
    const mapping = await getAmazonProductMapping(s.org.id, id)
    if (!mapping) {
      throw new AnalyticsProblem(404, "mapping_not_found", "Mapping not found.")
    }
    return Response.json({ mapping }, { headers: analyticsHeaders })
  })
}
export async function DELETE(request: Request, context: Context) {
  return analyticsRoute(request, true, async (s) => {
    const id = z.uuid().parse((await context.params).id)
    if (!(await retireAmazonProductMapping(s.org.id, s.user.id, id))) {
      throw new AnalyticsProblem(404, "mapping_not_found", "Mapping not found.")
    }
    return new Response(null, { status: 204, headers: analyticsHeaders })
  })
}
