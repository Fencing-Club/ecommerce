import { analyticsQuery, analyticsRoute } from "@/server/analytics-http"
import { fifoQuery, inventoryFifo } from "@/server/inventory-fifo"
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) =>
    Response.json(await inventoryFifo(s.org.id, analyticsQuery(request, fifoQuery)))
  )
}
