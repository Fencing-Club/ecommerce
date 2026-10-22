import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/callback"

export const Route = createFileRoute("/callback")({
  server: { handlers: apiHandlers(handlers) }
})
