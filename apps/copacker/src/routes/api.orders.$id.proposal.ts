import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST } from "@/server/http/api/orders/$id/proposal"

export const Route = createFileRoute("/api/orders/$id/proposal")({
  server: {
    handlers: {
      POST: ({ request, params }) => httpResponse(() => POST(request, { params }))
    }
  }
})
