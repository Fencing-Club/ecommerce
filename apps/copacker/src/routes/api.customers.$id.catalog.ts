import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST } from "@/server/http/api/customers/$id/catalog"

export const Route = createFileRoute("/api/customers/$id/catalog")({
  server: {
    handlers: {
      POST: ({ request, params }) => httpResponse(() => POST(request, { params }))
    }
  }
})
