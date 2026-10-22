import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/imports/$id/source"

export const Route = createFileRoute("/api/imports/$id/source")({
  server: { handlers: apiHandlers(handlers) }
})
