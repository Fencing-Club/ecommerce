import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/cli-consent"
export const Route = createFileRoute("/api/cli/consent")({ server: { handlers: apiHandlers(handlers) } })
