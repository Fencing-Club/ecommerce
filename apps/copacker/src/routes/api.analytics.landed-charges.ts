import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/landed-charges"

export const Route = createFileRoute("/api/analytics/landed-charges")({
  server: { handlers: apiHandlers(handlers) }
})
