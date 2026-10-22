import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/connections/amazon-ads"

export const Route = createFileRoute("/api/connections/amazon-ads")({
  server: { handlers: apiHandlers(handlers) }
})
