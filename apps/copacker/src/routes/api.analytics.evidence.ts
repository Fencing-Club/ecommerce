import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/evidence"

export const Route = createFileRoute("/api/analytics/evidence")({
  server: { handlers: apiHandlers(handlers) }
})
