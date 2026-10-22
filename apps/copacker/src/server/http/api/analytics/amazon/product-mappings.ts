import { z } from "zod"
import {
  listAmazonProductMappings,
  productMappingInput,
  saveAmazonProductMapping
} from "@/server/amazon-product-mappings"
import { AnalyticsProblem, analyticsPagination } from "@/server/analytics-contract"
import { analyticsId, analyticsJson, analyticsQuery, analyticsRoute } from "@/server/analytics-http"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) =>
    Response.json(await listAmazonProductMappings(s.org.id, analyticsQuery(request, z.object(analyticsPagination))))
  )
}
export async function POST(request: Request) {
  return analyticsRoute(request, true, async (s) => {
    const key = analyticsId(request.headers.get("Idempotency-Key"))
    const input = await analyticsJson(request, productMappingInput)
    const result = await saveAmazonProductMapping(s.org.id, s.user.id, input, key)
    if (!result.ok) {
      throw new AnalyticsProblem(
        result.reason === "target_not_in_workspace" ? 422 : 409,
        result.reason,
        result.reason === "target_not_in_workspace"
          ? "Choose a product in this workspace."
          : "The mapping conflicts with current data or an earlier request. Refresh before trying again."
      )
    }
    return Response.json(
      { mapping: result.mapping },
      {
        status: result.replayed ? 200 : 201,
        headers: { Location: `/api/analytics/amazon/product-mappings/${result.mapping!.id}` }
      }
    )
  })
}
