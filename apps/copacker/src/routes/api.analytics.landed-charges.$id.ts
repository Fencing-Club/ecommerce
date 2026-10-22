import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/landed-charges/$id"

export const Route = createFileRoute("/api/analytics/landed-charges/$id")({
  server: { handlers: apiHandlers(handlers) }
})
