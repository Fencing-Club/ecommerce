import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/products"

export const Route = createFileRoute("/api/inventory/products")({
  server: { handlers: apiHandlers(handlers) }
})
