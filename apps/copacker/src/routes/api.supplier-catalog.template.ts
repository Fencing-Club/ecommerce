import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/supplier-catalog/template"

export const Route = createFileRoute("/api/supplier-catalog/template")({
  server: { handlers: apiHandlers(handlers) }
})
