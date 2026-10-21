import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST } from "@/server/http/api/shipments/$id/carrier-labels"

export const Route = createFileRoute("/api/shipments/$id/carrier-labels")({
  server: {
    handlers: {
      POST: ({ request, params }) => httpResponse(() => POST(request, { params }))
    }
  }
})
