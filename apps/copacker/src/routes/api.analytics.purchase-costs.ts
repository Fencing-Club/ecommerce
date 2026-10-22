import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import { inventoryBasisCollection } from "@/server/inventory-basis-http"

export const Route = createFileRoute("/api/analytics/purchase-costs")({
  server: { handlers: apiHandlers(inventoryBasisCollection("purchase")) }
})
