import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/orders/$id/po"

export const Route = createFileRoute("/api/orders/$id/po")({
  server: { handlers: apiHandlers(handlers) }
})
