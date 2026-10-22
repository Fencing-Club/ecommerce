import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/contact"

export const Route = createFileRoute("/api/contact")({
  server: { handlers: apiHandlers(handlers) }
})
