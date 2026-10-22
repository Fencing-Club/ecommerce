import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/barcodes"

export const Route = createFileRoute("/api/inventory/barcodes")({
  server: { handlers: apiHandlers(handlers) }
})
