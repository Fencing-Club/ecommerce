import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/documents"

export const Route = createFileRoute("/api/documents")({
  server: { handlers: apiHandlers(handlers) }
})
