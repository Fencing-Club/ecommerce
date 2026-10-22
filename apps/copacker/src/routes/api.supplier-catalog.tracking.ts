import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/supplier-catalog/tracking"

export const Route = createFileRoute("/api/supplier-catalog/tracking")({
  server: { handlers: apiHandlers(handlers) }
})
