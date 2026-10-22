import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/mailing-list"

export const Route = createFileRoute("/api/mailing-list")({
  server: { handlers: apiHandlers(handlers) }
})
