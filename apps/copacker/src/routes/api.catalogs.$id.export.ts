import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/catalogs/$id/export"

export const Route = createFileRoute("/api/catalogs/$id/export")({
  server: { handlers: apiHandlers(handlers) }
})
