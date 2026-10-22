import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/catalogs/$id"

export const Route = createFileRoute("/api/catalogs/$id")({
  server: { handlers: apiHandlers(handlers) }
})
