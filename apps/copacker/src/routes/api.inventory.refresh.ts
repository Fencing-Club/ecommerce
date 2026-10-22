import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/refresh"

export const Route = createFileRoute("/api/inventory/refresh")({
  server: { handlers: apiHandlers(handlers) }
})
