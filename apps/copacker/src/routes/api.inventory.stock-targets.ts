import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/stock-targets"

export const Route = createFileRoute("/api/inventory/stock-targets")({ server: { handlers: apiHandlers(handlers) } })
