import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/orders/$id/labels"

export const Route = createFileRoute("/api/orders/$id/labels")({
  server: { handlers: apiHandlers(handlers) }
})
