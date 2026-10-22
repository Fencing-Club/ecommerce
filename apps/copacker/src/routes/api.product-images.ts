import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/product-images"

export const Route = createFileRoute("/api/product-images")({
  server: { handlers: apiHandlers(handlers) }
})
