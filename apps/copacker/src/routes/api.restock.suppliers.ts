import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/restock/suppliers"

export const Route = createFileRoute("/api/restock/suppliers")({
  server: { handlers: apiHandlers(handlers) }
})
