import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/action"

export const Route = createFileRoute("/api/action")({
  server: { handlers: apiHandlers(handlers) }
})
