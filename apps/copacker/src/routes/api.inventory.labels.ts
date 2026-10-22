import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/labels"

export const Route = createFileRoute("/api/inventory/labels")({
  server: { handlers: apiHandlers(handlers) }
})
