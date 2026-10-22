import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/restock/channels"

export const Route = createFileRoute("/api/restock/channels")({
  server: { handlers: apiHandlers(handlers) }
})
