import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/product-defaults"

export const Route = createFileRoute("/api/inventory/product-defaults")({
  server: { handlers: apiHandlers(handlers) }
})
