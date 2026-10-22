import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/restock/targets"

export const Route = createFileRoute("/api/restock/targets")({ server: { handlers: apiHandlers(handlers) } })
