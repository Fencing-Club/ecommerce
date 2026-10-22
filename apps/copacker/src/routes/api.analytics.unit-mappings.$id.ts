import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/unit-mappings/$id"

export const Route = createFileRoute("/api/analytics/unit-mappings/$id")({
  server: { handlers: apiHandlers(handlers) }
})
