import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/documents/$id"

export const Route = createFileRoute("/api/documents/$id")({
  server: { handlers: apiHandlers(handlers) }
})
