import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/maintenance"

export const Route = createFileRoute("/api/maintenance")({
  server: { handlers: apiHandlers(handlers) }
})
