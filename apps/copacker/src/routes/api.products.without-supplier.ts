import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/products/without-supplier"

export const Route = createFileRoute("/api/products/without-supplier")({
  server: { handlers: apiHandlers(handlers) }
})
