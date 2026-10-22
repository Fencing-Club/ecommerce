import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/restock/assign-supplier"

export const Route = createFileRoute("/api/restock/assign-supplier")({
  server: { handlers: apiHandlers(handlers) }
})
