import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/status"

export const Route = createFileRoute("/api/inventory/status")({
  server: { handlers: apiHandlers(handlers) }
})
