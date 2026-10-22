import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/amazon/product-mappings/$id"

export const Route = createFileRoute("/api/analytics/amazon/product-mappings/$id")({
  server: { handlers: apiHandlers(handlers) }
})
