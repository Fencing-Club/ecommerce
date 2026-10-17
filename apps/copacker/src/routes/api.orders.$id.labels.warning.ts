import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/orders/$id/labels/warning"

export const Route = createFileRoute("/api/orders/$id/labels/warning")({
  server: {
    handlers: {
      GET: ({ request, params }) => httpResponse(() => GET(request, { params }))
    }
  }
})
