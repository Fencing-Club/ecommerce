import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import { inventoryBasisResource } from "@/server/inventory-basis-http"

export const Route = createFileRoute("/api/analytics/receipts/$id")({
  server: { handlers: apiHandlers(inventoryBasisResource("receipt")) }
})
