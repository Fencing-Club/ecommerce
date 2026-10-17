import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/orders/$id/po"

export const Route = createFileRoute("/api/orders/$id/po")({
  server: {
    handlers: {
      GET: ({ request, params }) => httpResponse(() => GET(request, { params }))
    }
  }
})
