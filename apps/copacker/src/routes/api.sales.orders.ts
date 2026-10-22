import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/sales/orders"

export const Route = createFileRoute("/api/sales/orders")({
  server: { handlers: apiHandlers(handlers) }
})
