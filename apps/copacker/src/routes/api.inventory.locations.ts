import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/locations"

export const Route = createFileRoute("/api/inventory/locations")({
  server: { handlers: apiHandlers(handlers) }
})
