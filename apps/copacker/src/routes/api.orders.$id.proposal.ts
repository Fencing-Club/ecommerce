import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/orders/$id/proposal"

export const Route = createFileRoute("/api/orders/$id/proposal")({
  server: { handlers: apiHandlers(handlers) }
})
