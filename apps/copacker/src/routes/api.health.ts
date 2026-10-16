import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/health"

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => httpResponse(() => GET())
    }
  }
})
