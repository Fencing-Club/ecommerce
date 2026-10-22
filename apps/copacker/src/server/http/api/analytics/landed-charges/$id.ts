import { analyticsId, analyticsRoute } from "@/server/analytics-http"
import { getLandedCharge, retireLandedCharge } from "@/server/inventory-landed-costs"
type Context = { params: { id: string } }
export async function GET(request: Request, context: Context) {
  return analyticsRoute(request, false, async (s) =>
    Response.json({ charge: await getLandedCharge(s.org.id, analyticsId((await context.params).id)) })
  )
}
export async function DELETE(request: Request, context: Context) {
  return analyticsRoute(request, true, async (s) => {
    await retireLandedCharge(s.org.id, s.user.id, analyticsId((await context.params).id))
    return new Response(null, { status: 204 })
  })
}
