import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/cli-revoke"
export const Route = createFileRoute("/api/cli/revoke")({ server: { handlers: apiHandlers(handlers) } })
