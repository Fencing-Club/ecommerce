import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/imports"

export const Route = createFileRoute("/api/imports")({
  server: { handlers: apiHandlers(handlers) }
})
