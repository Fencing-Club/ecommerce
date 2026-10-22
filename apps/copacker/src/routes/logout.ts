import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/logout"

export const Route = createFileRoute("/logout")({
  server: { handlers: apiHandlers(handlers) }
})
