import { analyticsId, analyticsRoute } from "@/server/analytics-http"
import { getUnitMapping, retireUnitMapping } from "@/server/inventory-unit-mappings"
export async function GET(request: Request, context: { params: { id: string } }) {
  return analyticsRoute(request, false, async (s) =>
    Response.json({ mapping: await getUnitMapping(s.org.id, analyticsId(context.params.id)) })
  )
}
export async function DELETE(request: Request, context: { params: { id: string } }) {
  return analyticsRoute(request, true, async (s) => {
    await retireUnitMapping(s.org.id, s.user.id, analyticsId(context.params.id))
    return new Response(null, { status: 204 })
  })
}
