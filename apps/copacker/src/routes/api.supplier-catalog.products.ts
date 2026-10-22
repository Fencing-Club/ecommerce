import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/supplier-catalog/products"

export const Route = createFileRoute("/api/supplier-catalog/products")({
  server: { handlers: apiHandlers(handlers) }
})
