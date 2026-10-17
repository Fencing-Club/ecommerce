import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET, DELETE } from "@/server/http/api/analytics/receipts/$id"

export const Route = createFileRoute("/api/analytics/receipts/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => httpResponse(() => GET(request, { params })),
      DELETE: ({ request, params }) => httpResponse(() => DELETE(request, { params }))
    }
  }
})
