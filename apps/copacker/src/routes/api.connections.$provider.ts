import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/connections/$provider"

export const Route = createFileRoute("/api/connections/$provider")({
  server: { handlers: apiHandlers(handlers) }
})
