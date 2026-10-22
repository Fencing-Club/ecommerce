import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/supplier-catalog/import"

export const Route = createFileRoute("/api/supplier-catalog/import")({
  server: { handlers: apiHandlers(handlers) }
})
