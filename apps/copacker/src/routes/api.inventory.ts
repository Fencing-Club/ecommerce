import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory"

export const Route = createFileRoute("/api/inventory")({
  server: { handlers: apiHandlers(handlers) }
})
