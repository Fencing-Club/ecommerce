import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/sales"

export const Route = createFileRoute("/api/sales")({
  server: { handlers: apiHandlers(handlers) }
})
