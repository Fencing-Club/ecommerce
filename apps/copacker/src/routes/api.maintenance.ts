import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/maintenance"

export const Route = createFileRoute("/api/maintenance")({
  server: {
    handlers: {
      GET: () => httpResponse(() => GET())
    }
  }
})
