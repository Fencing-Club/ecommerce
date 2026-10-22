import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/supplier-catalog/match"

export const Route = createFileRoute("/api/supplier-catalog/match")({
  server: { handlers: apiHandlers(handlers) }
})
