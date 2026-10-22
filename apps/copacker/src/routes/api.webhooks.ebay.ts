import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/webhooks/ebay"

export const Route = createFileRoute("/api/webhooks/ebay")({
  server: { handlers: apiHandlers(handlers) }
})
