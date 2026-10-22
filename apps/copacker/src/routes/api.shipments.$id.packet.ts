import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/shipments/$id/packet"

export const Route = createFileRoute("/api/shipments/$id/packet")({
  server: { handlers: apiHandlers(handlers) }
})
