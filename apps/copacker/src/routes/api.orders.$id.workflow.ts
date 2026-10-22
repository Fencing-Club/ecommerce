import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/orders/$id/workflow"

export const Route = createFileRoute("/api/orders/$id/workflow")({
  server: { handlers: apiHandlers(handlers) }
})
