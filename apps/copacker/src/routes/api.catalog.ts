import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/catalog"

export const Route = createFileRoute("/api/catalog")({
  server: { handlers: apiHandlers(handlers) }
})
