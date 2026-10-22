import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/restock/plan"

export const Route = createFileRoute("/api/restock/plan")({
  server: { handlers: apiHandlers(handlers) }
})
