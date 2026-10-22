import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/product-labels"

export const Route = createFileRoute("/api/inventory/product-labels")({
  server: { handlers: apiHandlers(handlers) }
})
