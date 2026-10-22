import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/mailing-list/unsubscribe"

export const Route = createFileRoute("/api/mailing-list/unsubscribe")({
  server: { handlers: apiHandlers(handlers) }
})
