import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/imports/$id/save"

export const Route = createFileRoute("/api/imports/$id/save")({
  server: { handlers: apiHandlers(handlers) }
})
