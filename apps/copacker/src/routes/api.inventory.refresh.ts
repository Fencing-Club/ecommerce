import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST } from "@/server/http/api/inventory/refresh"

export const Route = createFileRoute("/api/inventory/refresh")({
  server: {
    handlers: {
      POST: ({ request }) => httpResponse(() => POST(request))
    }
  }
})
