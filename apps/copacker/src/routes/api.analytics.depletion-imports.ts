import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/depletion-imports"

export const Route = createFileRoute("/api/analytics/depletion-imports")({
  server: { handlers: apiHandlers(handlers) }
})
