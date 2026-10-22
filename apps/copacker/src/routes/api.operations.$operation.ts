import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/operation"
export const Route = createFileRoute("/api/operations/$operation")({ server: { handlers: apiHandlers(handlers) } })
