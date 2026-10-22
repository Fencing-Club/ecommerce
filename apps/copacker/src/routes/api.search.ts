import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/search"

export const Route = createFileRoute("/api/search")({
  server: { handlers: apiHandlers(handlers) }
})
