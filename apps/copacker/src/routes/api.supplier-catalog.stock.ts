import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/supplier-catalog/stock"

export const Route = createFileRoute("/api/supplier-catalog/stock")({
  server: { handlers: apiHandlers(handlers) }
})
