import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/shipments/$id/carrier-labels"

export const Route = createFileRoute("/api/shipments/$id/carrier-labels")({
  server: { handlers: apiHandlers(handlers) }
})
