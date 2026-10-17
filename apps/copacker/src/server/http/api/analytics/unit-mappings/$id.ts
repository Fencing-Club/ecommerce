import { z } from "zod"
import { analyticsRoute, analyticsHeaders } from "@/server/analytics-http"
import { getUnitMapping, retireUnitMapping } from "@/server/inventory-unit-mappings"
export async function GET(request: Request, context: { params: { id: string } }) {
  return analyticsRoute(request, false, async (s) =>
    Response.json(
      { mapping: await getUnitMapping(s.org.id, z.uuid().parse((await context.params).id)) },
      { headers: analyticsHeaders }
    )
  )
}
export async function DELETE(request: Request, context: { params: { id: string } }) {
  return analyticsRoute(request, true, async (s) => {
    await retireUnitMapping(s.org.id, s.user.id, z.uuid().parse((await context.params).id))
    return new Response(null, { status: 204, headers: analyticsHeaders })
  })
}
