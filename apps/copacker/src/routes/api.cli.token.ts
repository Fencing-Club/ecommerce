import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/cli-token"
export const Route = createFileRoute("/api/cli/token")({ server: { handlers: apiHandlers(handlers) } })
