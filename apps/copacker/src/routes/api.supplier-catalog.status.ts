import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/supplier-catalog/status"

export const Route = createFileRoute("/api/supplier-catalog/status")({
  server: { handlers: apiHandlers(handlers) }
})
