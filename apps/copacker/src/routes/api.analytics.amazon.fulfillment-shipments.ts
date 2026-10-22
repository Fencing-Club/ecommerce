import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/amazon/fulfillment-shipments"

export const Route = createFileRoute("/api/analytics/amazon/fulfillment-shipments")({
  server: { handlers: apiHandlers(handlers) }
})
