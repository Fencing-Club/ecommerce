import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/workspace"

export const Route = createFileRoute("/api/workspace")({
  server: { handlers: apiHandlers(handlers) }
})
