import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/orders/summary"

export const Route = createFileRoute("/api/orders/summary")({
  server: { handlers: apiHandlers(handlers) }
})
