import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/analytics/fifo"

export const Route = createFileRoute("/api/analytics/fifo")({
  server: { handlers: apiHandlers(handlers) }
})
