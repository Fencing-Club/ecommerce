import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/analytics/amazon/fulfillment-shipments"

export const Route = createFileRoute("/api/analytics/amazon/fulfillment-shipments")({
  server: {
    handlers: {
      GET: ({ request }) => httpResponse(() => GET(request))
    }
  }
})
