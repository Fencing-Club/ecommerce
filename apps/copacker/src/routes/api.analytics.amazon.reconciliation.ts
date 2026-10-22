import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/amazon/reconciliation"

export const Route = createFileRoute("/api/analytics/amazon/reconciliation")({
  server: { handlers: apiHandlers(handlers) }
})
