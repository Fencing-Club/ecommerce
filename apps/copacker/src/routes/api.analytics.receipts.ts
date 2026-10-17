import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET, POST } from "@/server/http/api/analytics/receipts"

export const Route = createFileRoute("/api/analytics/receipts")({
  server: {
    handlers: {
      GET: ({ request }) => httpResponse(() => GET(request)),
      POST: ({ request }) => httpResponse(() => POST(request))
    }
  }
})
