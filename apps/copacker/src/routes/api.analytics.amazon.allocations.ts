import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/amazon/allocations"

export const Route = createFileRoute("/api/analytics/amazon/allocations")({
  server: { handlers: apiHandlers(handlers) }
})
