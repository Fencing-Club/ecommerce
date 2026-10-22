import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/variant-fields"

export const Route = createFileRoute("/api/inventory/variant-fields")({
  server: { handlers: apiHandlers(handlers) }
})
