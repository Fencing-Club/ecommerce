import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/ingestion-status"

export const Route = createFileRoute("/api/analytics/ingestion-status")({
  server: { handlers: apiHandlers(handlers) }
})
