import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST } from "@/server/http/api/inventory/demand"

export const Route = createFileRoute("/api/inventory/demand")({
  server: {
    handlers: {
      POST: ({ request }) => httpResponse(() => POST(request))
    }
  }
})
