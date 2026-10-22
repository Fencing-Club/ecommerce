import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/cli-authorize"
export const Route = createFileRoute("/api/cli/authorize")({ server: { handlers: apiHandlers(handlers) } })
