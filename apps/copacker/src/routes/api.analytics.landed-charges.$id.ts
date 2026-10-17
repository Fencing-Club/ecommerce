import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET, DELETE } from "@/server/http/api/analytics/landed-charges/$id"

export const Route = createFileRoute("/api/analytics/landed-charges/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => httpResponse(() => GET(request, { params })),
      DELETE: ({ request, params }) => httpResponse(() => DELETE(request, { params }))
    }
  }
})
