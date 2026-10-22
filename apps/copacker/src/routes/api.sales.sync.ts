import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/sales/sync"

export const Route = createFileRoute("/api/sales/sync")({
  server: { handlers: apiHandlers(handlers) }
})
