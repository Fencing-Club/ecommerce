import { z } from "zod"
import { inventoryBasisSchemas, type InventoryBasisKind } from "@/lib/inventory-basis"
import { analyticsHeaders, analyticsJson, analyticsRoute } from "./analytics-http"
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
      analyticsRoute(request, false, async (s) => {
        const input = inventoryBasisQuery.parse(Object.fromEntries(new URL(request.url).searchParams))
        return Response.json(await listInventoryBasis(s.org.id, kind, input), { headers: analyticsHeaders })
      }),
    POST: (request: Request) =>
      analyticsRoute(request, true, async (s) => {
        const key = z.uuid().parse(request.headers.get("Idempotency-Key"))
        const input = inventoryBasisSchemas[kind].parse(await analyticsJson(request))
        const result = await saveInventoryBasis(s.org.id, s.user.id, key, input)
        return Response.json(
          { record: result.record },
          {
            status: result.replayed ? 200 : 201,
            headers: { ...analyticsHeaders, Location: `/api/analytics/${paths[kind]}/${result.record.id}` }
          }
        )
      })
  }
}
export function inventoryBasisResource(kind: InventoryBasisKind) {
  return {
    GET: (request: Request, context: { params: Promise<{ id: string }> }) =>
      analyticsRoute(request, false, async (s) => {
        const id = z.uuid().parse((await context.params).id)
        return Response.json({ record: await getInventoryBasis(s.org.id, kind, id) }, { headers: analyticsHeaders })
      }),
    DELETE: (request: Request, context: { params: Promise<{ id: string }> }) =>
      analyticsRoute(request, true, async (s) => {
        const id = z.uuid().parse((await context.params).id)
        await retireInventoryBasis(s.org.id, s.user.id, kind, id)
        return new Response(null, { status: 204, headers: analyticsHeaders })
      })
  }
}
