import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/orders/$id/labels/warning"

export const Route = createFileRoute("/api/orders/$id/labels/warning")({
  server: { handlers: apiHandlers(handlers) }
})
