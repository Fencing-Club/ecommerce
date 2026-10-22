import { inventoryBasisSchemas, type InventoryBasisKind } from "@/lib/inventory-basis"
import { analyticsId, analyticsJson, analyticsQuery, analyticsRoute } from "./analytics-http"
import {
  inventoryBasisQuery,
  saveInventoryBasis,
  getInventoryBasis,
  listInventoryBasis,
  retireInventoryBasis
} from "./inventory-basis"
const paths = {
  purchase: "purchase-costs",
  opening: "opening-balances",
  receipt: "receipts",
  depletion: "depletions"
} as const
export function inventoryBasisCollection(kind: InventoryBasisKind) {
  return {
    GET: (request: Request) =>
      analyticsRoute(request, false, async (s) =>
        Response.json(await listInventoryBasis(s.org.id, kind, analyticsQuery(request, inventoryBasisQuery)))
      ),
    POST: (request: Request) =>
      analyticsRoute(request, true, async (s) => {
        const key = analyticsId(request.headers.get("Idempotency-Key"))
        const input = await analyticsJson(request, inventoryBasisSchemas[kind])
        const result = await saveInventoryBasis(s.org.id, s.user.id, key, input)
        return Response.json(
          { record: result.record },
          {
            status: result.replayed ? 200 : 201,
            headers: { Location: `/api/analytics/${paths[kind]}/${result.record.id}` }
          }
        )
      })
  }
}
export function inventoryBasisResource(kind: InventoryBasisKind) {
  return {
    GET: (request: Request, context: { params: { id: string } }) =>
      analyticsRoute(request, false, async (s) =>
        Response.json({ record: await getInventoryBasis(s.org.id, kind, analyticsId(context.params.id)) })
      ),
    DELETE: (request: Request, context: { params: { id: string } }) =>
      analyticsRoute(request, true, async (s) => {
        await retireInventoryBasis(s.org.id, s.user.id, kind, analyticsId(context.params.id))
        return new Response(null, { status: 204 })
      })
  }
}
