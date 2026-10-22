import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/operating-costs"

export const Route = createFileRoute("/api/analytics/operating-costs")({
  server: { handlers: apiHandlers(handlers) }
})
