import { createFileRoute } from "@tanstack/react-router"
import { apiHandlers } from "@/server/http-response"
import * as handlers from "@/server/http/api/inventory/location-groups"

export const Route = createFileRoute("/api/inventory/location-groups")({ server: { handlers: apiHandlers(handlers) } })
