import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/health"

export const Route = createFileRoute("/api/health")({
  server: { handlers: apiHandlers(handlers) }
})
