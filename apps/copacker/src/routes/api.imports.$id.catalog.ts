import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/imports/$id/catalog"

export const Route = createFileRoute("/api/imports/$id/catalog")({
  server: { handlers: apiHandlers(handlers) }
})
