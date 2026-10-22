import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/demand"

export const Route = createFileRoute("/api/inventory/demand")({
  server: { handlers: apiHandlers(handlers) }
})
