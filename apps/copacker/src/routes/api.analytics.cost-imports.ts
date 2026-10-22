import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/cost-imports"

export const Route = createFileRoute("/api/analytics/cost-imports")({
  server: { handlers: apiHandlers(handlers) }
})
