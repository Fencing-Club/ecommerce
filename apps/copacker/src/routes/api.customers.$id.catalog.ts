import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/customers/$id/catalog"

export const Route = createFileRoute("/api/customers/$id/catalog")({
  server: { handlers: apiHandlers(handlers) }
})
