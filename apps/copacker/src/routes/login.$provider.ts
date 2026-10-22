import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/login/$provider"

export const Route = createFileRoute("/login/$provider")({
  server: { handlers: apiHandlers(handlers) }
})
