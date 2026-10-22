import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/cost-import-previews"

export const Route = createFileRoute("/api/analytics/cost-import-previews")({
  server: { handlers: apiHandlers(handlers) }
})
