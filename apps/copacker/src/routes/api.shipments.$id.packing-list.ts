import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/shipments/$id/packing-list"

export const Route = createFileRoute("/api/shipments/$id/packing-list")({
  server: { handlers: apiHandlers(handlers) }
})
