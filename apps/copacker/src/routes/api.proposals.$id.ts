import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/proposals/$id"

export const Route = createFileRoute("/api/proposals/$id")({
  server: { handlers: apiHandlers(handlers) }
})
