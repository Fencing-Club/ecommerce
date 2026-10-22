import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/catalogs"

export const Route = createFileRoute("/api/catalogs")({
  server: { handlers: apiHandlers(handlers) }
})
